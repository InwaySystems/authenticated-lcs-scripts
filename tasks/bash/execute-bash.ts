import fs = require('fs');
import path = require('path');
import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import uuidV4 = require('uuid/v4');

const noProfile = tl.getBoolInput('noProfile');
const noRc = tl.getBoolInput('noRc');

async function translateDirectoryPath(bashPath: string, directoryPath: string): Promise<string> {
    let bashPwd = tl.tool(bashPath)
        .arg('--noprofile')
        .arg('--norc')
        .arg('-c')
        .arg('pwd');

    let bashPwdOptions = <tr.IExecOptions>{
        cwd: directoryPath,
        failOnStdErr: true,
        errStream: process.stdout,
        outStream: process.stdout,
        ignoreReturnCode: false
    };
    let pwdOutput = '';
    bashPwd.on('stdout', (data) => {
        pwdOutput += data.toString();
    });
    await bashPwd.exec(bashPwdOptions);
    pwdOutput = pwdOutput.trim();
    if (!pwdOutput) {
        throw new Error(tl.loc('JS_TranslatePathFailed', directoryPath));
    }

    return `${pwdOutput}`;
}

function getServiceConnection() {
    const serviceConnectionId = tl.getInput("lcsServiceConnection", true);
    const url = tl.getEndpointUrl(serviceConnectionId, true);
    const username = tl.getEndpointAuthorizationParameter(serviceConnectionId, "username", true);
    const password = tl.getEndpointAuthorizationParameter(serviceConnectionId, "password", false);
    const clientid = tl.getEndpointAuthorizationParameter(serviceConnectionId, "clientid", true);
    const lcsApiUrl = tl.getEndpointDataParameter(serviceConnectionId, "apiurl", true);

    return {
        url: url,
        username: username,
        password: password,
        clientid: clientid,
        lcsApiUrl: lcsApiUrl
    }
}

async function run() {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        // Get inputs.
        let input_failOnStderr = tl.getBoolInput('failOnStderr', false);
        let input_workingDirectory = tl.getPathInput('workingDirectory', /*required*/ true, /*check*/ true);
        let input_filePath: string;
        let input_arguments: string;
        let input_script: string;
        let old_source_behavior: boolean;
        let input_targetType: string = tl.getInput('targetType') || '';
        if (input_targetType.toUpperCase() == 'FILEPATH') {
            old_source_behavior = !!process.env['AZP_BASHV3_OLD_SOURCE_BEHAVIOR'];
            input_filePath = tl.getPathInput('filePath', /*required*/ true);
            if (!tl.stats(input_filePath).isFile()) {
                throw new Error(tl.loc('JS_InvalidFilePath', input_filePath));
            }

            input_arguments = tl.getInput('arguments') || '';
        }
        else {
            input_script = tl.getInput('script', false) || '';
        }

        // Generate the script contents.
        console.log(tl.loc('GeneratingScript'));
        let bashPath: string = tl.which('bash', true);
        let contents: string;
        if (input_targetType.toUpperCase() == 'FILEPATH') {
            // Translate the target file path from Windows to the Linux file system.
            let targetFilePath: string;
            if (process.platform == 'win32') {
                targetFilePath = await translateDirectoryPath(bashPath, path.dirname(input_filePath)) + '/' + path.basename(input_filePath);
            }
            else {
                targetFilePath = input_filePath;
            }
            // Choose behavior:
            // If they've set old_source_behavior, source the script. This is what we used to do and needs to hang around forever for back compat reasons
            // If they've not, execute the script with bash. This is our new desired behavior.
            // See https://github.com/Microsoft/azure-pipelines-tasks/blob/master/docs/bashnote.md
            if (old_source_behavior) {
                contents = `. '${targetFilePath.replace(/'/g, "'\\''")}' ${input_arguments}`.trim();
            } else {
                contents = `exec bash '${targetFilePath.replace(/'/g, "'\\''")}' ${input_arguments}`.trim();
            }
            console.log(tl.loc('JS_FormattedCommand', contents));
        }
        else {
            contents = input_script;

            // Print one-liner scripts.
            if (contents.indexOf('\n') < 0 && contents.toUpperCase().indexOf('##VSO[') < 0) {
                console.log(tl.loc('JS_ScriptContents'));
                console.log(contents);
            }
        }

        // Write the script to disk.
        tl.assertAgent('2.115.0');
        let tempDirectory = tl.getVariable('agent.tempDirectory');
        tl.checkPath(tempDirectory, `${tempDirectory} (agent.tempDirectory)`);
        let fileName = uuidV4() + '.sh';
        let filePath = path.join(tempDirectory, fileName);
        await fs.writeFileSync(
            filePath,
            contents,
            { encoding: 'utf8' });

        // Translate the script file path from Windows to the Linux file system.
        if (process.platform == 'win32') {
            filePath = await translateDirectoryPath(bashPath, tempDirectory) + '/' + fileName;
        }

        // Create the tool runner.
        console.log('========================== Starting Command Output ===========================');
        let bash = tl.tool(bashPath);
        if (noProfile) {
            bash.arg('--noprofile');
        }
        if (noRc) {
            bash.arg('--norc');
        }
        bash.arg(filePath);

        const serviceConnection = getServiceConnection();
        const serviceConnectionAsEnv = {
            "AS_SC_URL": serviceConnection.url,
            "AS_SC_USERNAME": serviceConnection.username,
            "AS_SC_PASSWORD": serviceConnection.password,
            "AS_SC_CLIENTID": serviceConnection.clientid,
            "AS_SC_APIURL": serviceConnection.lcsApiUrl
        };

        // We do not want to overwrite the existing environment variables.
        const mergedEnvironment = {
            ...process.env,
            ...serviceConnectionAsEnv
        }

        let options = <tr.IExecOptions>{
            cwd: input_workingDirectory,
            failOnStdErr: false,
            errStream: process.stdout, // Direct all output to STDOUT, otherwise the output may appear out
            outStream: process.stdout, // of order since Node buffers it's own STDOUT but not STDERR.
            ignoreReturnCode: true,
            env: mergedEnvironment
        };

        process.on("SIGINT", () => {
            tl.debug('Started cancellation of executing script');
            bash.killChildProcess();
        });

        // Listen for stderr.
        let stderrFailure = false;
        const aggregatedStderr: string[] = [];
        if (input_failOnStderr) {
            bash.on('stderr', (data: Buffer) => {
                stderrFailure = true;
                aggregatedStderr.push(data.toString('utf8'));
            });
        }

        // Run bash.
        let exitCode: number = await bash.exec(options);

        let result = tl.TaskResult.Succeeded;

        // Fail on exit code.
        if (exitCode !== 0) {
            tl.error(tl.loc('JS_ExitCode', exitCode));
            result = tl.TaskResult.Failed;
        }

        // Fail on stderr.
        if (stderrFailure) {
            tl.error(tl.loc('JS_Stderr'));
            aggregatedStderr.forEach((err: string) => {
                tl.error(err);
            });
            result = tl.TaskResult.Failed;
        }

        tl.setResult(result, null, true);
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message || 'run() failed', true);
    }
}

run();
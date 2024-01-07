# LCS Authenticated Scripts

Use a [LCS service connection][lcsServiceConnection] with scripts instead of pasting secrets into variables!

## Features

* ✅ Supply LCS Service Connection to a PowerShell script
* ✅ Supply LCS Service Connection to a Bash script

## How

![A screenshot showing the service connection exposed as environment variables](/docs/highlighted_env.png)

This task injects the values of a LCS Service Connection into the current environment so that the specified script may utilize them. The values of the LCS Service Connection are mapped to environment variables as follows:

| Service Connection Variable | Environment Variable |
| --------------------------- | -------------------- |
| url                         | AS_SC_URL            |
| username                    | AS_SC_USERNAME       |
| password                    | AS_SC_PASSWORD       |
| clientid                    | AS_SC_CLIENTID       |
| lcsApiUrl                   | AS_SC_APIURL         |

Please note that this task does **not** persist the environment variables for longer than the execution of the script itself.

### A note on acronyms

`AS_SC_` (i.e. *Authenticated Shell Service Connection*) is prepended to the environment variable names to reduce the chance of collisions.

## Example

Please note that `lcsServiceConnection: 'Testing LCS Authenticated Shell'` was configured with a [LCS Service Connection][lcsServiceConnection]. 

```yml
steps:
- task: LCSAuthenticatedPowerShell@0
  inputs:
    serviceConnection: 'Testing LCS Authenticated Shell'
    targetType: inline
    script: 'Write-Host "url: $env:AS_SC_URL | username: $env:AS_SC_USERNAME | password: $env:AS_SC_PASSWORD | clientid: $env:AS_SC_CLIENTID | lcsApiUrl: $env:AS_SC_APIURL"'
- task: LCSAuthenticatedBash@0 
  inputs:
    serviceConnection: 'Testing LCS Authenticated Shell'
    targetType: inline
    script: 'echo "Hello $AS_SC_URL $AS_SC_USERNAME $AS_SC_PASSWORD $AS_SC_CLIENTID $AS_SC_APIURL"'     
```

## Motivation

While the LCS service connection provided by the Azure DevOps extension [Dynamics 365 Finance and Operations Tools](https://marketplace.visualstudio.com/items?itemName=Dyn365FinOps.dynamics365-finops-tools) is great, it is limited to the tasks that ship with the extension. If other endpoints of the LCS API are  (e.g. the [Database Movement API](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/database/api/dbmovement-api-overview)), one must resort to using a script.

Unfortunately, the credentials stored in the LCS service connection are not exposed as environment variables and thus cannot be used by scripts. Without this extension, the credentials would have to be provided as variables in the pipeline (e.g. by using an Azure DevOps Pipelines library or an Azure Key Vault). This is not ideal as the credentials might be exposed in the pipeline and would have to be updated in multiple places if they were to change.

## EULA

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[lcsServiceConnection]: https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/dev-tools/pipeline-lcs-connection

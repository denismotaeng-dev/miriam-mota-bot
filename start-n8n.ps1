$env:Path += ";C:\Program Files\nodejs;$env:APPDATA\npm"
$env:N8N_USER_FOLDER = "$PSScriptRoot\.n8n"
$env:N8N_PORT = "5678"
# Pasta que o n8n pode ler (fotos de referência das macas para a simulação)
$env:N8N_RESTRICT_FILE_ACCESS_TO = "$PSScriptRoot\assets"
# Nós de código: fs para ler as fotos de referência e @napi-rs/canvas para a marca d'água
$env:NODE_FUNCTION_ALLOW_BUILTIN = "fs"
$env:NODE_FUNCTION_ALLOW_EXTERNAL = "@napi-rs/canvas"
$env:WEBHOOK_URL = "https://trickily-flavored-mutual.ngrok-free.dev/"
# Editor e retorno do login do Google (OAuth) pelo localhost; o ngrok fica só para os webhooks
$env:N8N_EDITOR_BASE_URL = "http://localhost:5678/"
n8n start

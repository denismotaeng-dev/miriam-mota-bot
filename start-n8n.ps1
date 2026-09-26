$env:Path += ";C:\Program Files\nodejs;$env:APPDATA\npm"
$env:N8N_USER_FOLDER = "$PSScriptRoot\.n8n"
$env:N8N_PORT = "5678"
# Pasta que o n8n pode ler (fotos de referência das macas para a simulação)
$env:N8N_RESTRICT_FILE_ACCESS_TO = "$PSScriptRoot\assets"
$env:WEBHOOK_URL = "https://trickily-flavored-mutual.ngrok-free.dev/"
n8n start

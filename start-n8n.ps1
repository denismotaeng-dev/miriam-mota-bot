$env:Path += ";C:\Program Files\nodejs;$env:APPDATA\npm"
$env:N8N_USER_FOLDER = "$PSScriptRoot\.n8n"
$env:N8N_PORT = "5678"
$env:WEBHOOK_URL = "https://trickily-flavored-mutual.ngrok-free.dev/"
n8n start

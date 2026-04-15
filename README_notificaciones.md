# MediAlertV3 - Notificaciones con PyWhatKit

El backend usa `PyWhatKit` para WhatsApp y puede seguir usando Twilio solo para SMS si lo deseas.

## Como funciona WhatsApp

- El backend ejecuta un script Python.
- `PyWhatKit` abre WhatsApp Web en el navegador.
- Debes tener internet y una sesion iniciada en WhatsApp Web en esa computadora.
- La computadora debe estar desbloqueada y con escritorio disponible cuando se envie el mensaje.

## Requisitos

```bash
python -m pip install pywhatkit
```

## Variables opcionales

En tu `.env`:

```env
PYTHON_BIN=python
PYWHATKIT_WAIT_TIME=20
PYWHATKIT_CLOSE_TAB=true
PYWHATKIT_CLOSE_TIME=3
PYWHATKIT_TIMEOUT_MS=120000
```

Opcional para SMS por Twilio:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+523121234567
```

## Pruebas rapidas

Inicia el servidor:

```bash
npm start
```

Prueba WhatsApp:

```bash
curl -X POST http://localhost:3000/api/patients/test-whatsapp ^
  -H "Content-Type: application/json" ^
  -d "{\"phone\":\"5213121234567\"}"
```

Prueba SMS:

```bash
curl -X POST http://localhost:3000/api/patients/test-sms ^
  -H "Content-Type: application/json" ^
  -d "{\"phone\":\"3123176770\"}"
```

## Notas

- Para WhatsApp, usa el numero con lada pais, por ejemplo `5213121234567`.
- `PyWhatKit` automatiza WhatsApp Web; es util para demo escolar pero no es ideal para produccion.
- Si el navegador tarda mucho en abrir WhatsApp Web, sube `PYWHATKIT_WAIT_TIME`.
- Si el scheduler manda un recordatorio mientras usas el teclado o mouse, `PyWhatKit` puede interferir porque simula interaccion.

# Configuración de WhatsApp para Notificaciones

## 📋 Descripción

El sistema MediAlert incluye integración con WhatsApp para enviar recordatorios de medicamentos a los pacientes. Esta guía te ayudará a configurar y usar esta funcionalidad.

## 🔗 Acceder a la Configuración de WhatsApp

### Opción 1: Desde el Sidebar (Recomendado)

1. Inicia sesión como doctor en el sistema
2. En el panel del doctor, busca el **sidebar izquierdo**
3. Haz clic en el botón **"WhatsApp"** (última opción, con ícono de WhatsApp)
4. Serás redirigido a la página de configuración

### Opción 2: URL Directa

Accede directamente a:
```
http://localhost:3000/doctor/whatsapp-setup.html
```

## 🚀 Proceso de Configuración

### Paso 1: Iniciar Configuración
1. En la página de configuración de WhatsApp, haz clic en **"Generar código QR"**
2. El sistema generará un código QR único

### Paso 2: Escanear QR con WhatsApp
1. Abre **WhatsApp** en tu celular
2. Ve a **Configuración** (iPhone) o **⋮ Más opciones** (Android)
3. Selecciona **Dispositivos vinculados**
4. Toca **Vincular un dispositivo**
5. Apunta tu cámara hacia el código QR en la pantalla

### Paso 3: Esperar Confirmación
- El sistema verificará automáticamente la conexión cada 3 segundos
- Cuando el QR sea escaneado exitosamente, verás un mensaje de **"WhatsApp conectado exitosamente"**
- El botón "Generar código QR" desaparecerá y aparecerá el botón "Cerrar sesión"

## ⚠️ Importante

- **No cierres la ventana** del navegador mientras esperas que el QR sea escaneado
- El código QR expira después de cierto tiempo (aproximadamente 10 intentos de verificación)
- Si el QR expira, simplemente genera uno nuevo haciendo clic en "Generar código QR" nuevamente

## 🔒 Seguridad

- La sesión de WhatsApp está asociada exclusivamente a tu cuenta de doctor
- Las credenciales de sesión se guardan de forma segura en la base de datos
- Puedes cerrar sesión en cualquier momento desde el botón "Cerrar sesión"

## 🛠️ Solución de Problemas

### El QR no aparece
- Verifica que hayas iniciado sesión como doctor
- Recarga la página e intenta nuevamente

### El QR expira muy rápido
- Asegúrate de tener buena conexión a internet
- Escanea el QR lo más pronto posible después de generarlo

### WhatsApp no se conecta después de escanear
- Verifica que tu celular tenga conexión a internet
- Espera unos segundos, la conexión puede tardar un momento
- Si persiste el problema, cierra sesión e intenta de nuevo

### Error "No hay sesión de WhatsApp activa"
- Esto puede pasar si la sesión expiró
- Ve a la página de configuración y cierra sesión
- Luego genera un nuevo QR y vuelve a escanear

## 📊 Estado de la Conexión

El sistema muestra el estado de tu conexión:
- ✅ **WhatsApp conectado exitosamente** - Puedes enviar notificaciones
- ❌ **No tienes WhatsApp conectado** - Debes configurar la conexión
- 📱 **Escanea el código QR** - Proceso de configuración en progreso

## 🔄 Reinicio del Servidor

Después de los cambios recientes:
1. **Reinicia el servidor** para aplicar las actualizaciones:
   ```bash
   npm start
   ```
   o en modo desarrollo:
   ```bash
   npm run dev
   ```

2. El sistema ahora incluye:
   - ✅ Enlace a WhatsApp en el sidebar del doctor
   - ✅ Servicio de WhatsApp completamente habilitado
   - ✅ 0 vulnerabilidades de seguridad

## 📝 Notas Técnicas

- El servicio de WhatsApp usa la librería `@whiskeysockets/baileys`
- Las sesiones se guardan en la base de datos (PostgreSQL) con fallback a archivos locales
- El sistema verifica automáticamente el estado de conexión cada 3 segundos
- Soporta reconexión automática en caso de desconexión accidental

## 🆘 Soporte

Si experimentas problemas técnicos:
1. Revisa la consola del navegador (F12) para errores
2. Verifica los logs del servidor en la terminal
3. Asegúrate de tener la última versión del código
4. Consulta el archivo `README_notificaciones.md` para más detalles sobre el sistema de notificaciones

---

**¡Listo!** Ahora puedes configurar WhatsApp y comenzar a enviar recordatorios de medicamentos a tus pacientes.
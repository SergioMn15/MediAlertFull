
const twilio = require('twilio');

const authToken

// Plantilla aprobada HX*
client.messages.create({
     from: 'whatsapp:+14155238886',
     contentSid: 'HX350d429d32e64a552466cafecbe95f3c',
     contentVariables: JSON.stringify({
       "1": "15/4",
       "2": "10:30am"
     }),
     to: 'whatsapp:+5213123176770'
   })
   .then(message => console.log('✅ WhatsApp enviado:', message.sid))
   .catch(error => console.error('❌ Error:', error.message))
   .done();


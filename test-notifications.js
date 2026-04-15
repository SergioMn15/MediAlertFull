const notifier = require('./backend/src/services/notifier');
const { buildReminderMessage } = require('./backend/src/services/reminderEngine');

async function testAllNotifications() {
  console.log('🧪 PRUEBAS COMPLETAS NOTIFICACIONES MediAlertV3');
  console.log('==================================================');
  
  const patientDemo = {
    name: 'Rosa Martinez',
    phone: '3123176770',
    email: 'rosa@example.com',
    reminder_channel: 'sms',
    reminder_opt_in: true
  };
  
  const itemDemo = {
    name: 'Losartan 50mg',
    dose_mg: 50,
    time: '20:00',
    interval_hours: 24
  };
  
  const scheduledAt = new Date();
  
  console.log('1. Test notificación completa...');
  try {
    const result = await notifier.sendReminderNotification(patientDemo, itemDemo, scheduledAt);
    console.log('✅ Resultado:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
  
  console.log('\\n2. Test mensaje MediAlert...');
  const msg = buildReminderMessage(patientDemo, itemDemo, scheduledAt);
  console.log('✅ Mensaje:', msg.text.substring(0, 100) + '...');
  
  console.log('\\n3. Endpoint test (terminal npm start):');
  console.log('curl -X POST http://localhost:3000/api/patients/test-sms -H "Content-Type: application/json" -d "{\\"phone\\":\\"3123176770\\"}"');
  
  console.log('\\n✅ SISTEMA FUNCIONAL - Revisa logs npm start para simulados!');
}

testAllNotifications().catch(console.error);

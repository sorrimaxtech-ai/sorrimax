import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

// Credenciais vêm do ambiente — nunca hardcoded. O projeto a que este script
// se conecta é decidido pelo .env, não pelo código:
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/seed-debug.mjs
if (!supabaseUrl || !supabaseKey) {
  console.error('erro: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedDebugData() {
  try {
    console.log('🌱 Starting seed process...');
    
    // Get clinic ID for debug user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinica_id')
      .eq('email', 'debug@crm.com')
      .single();

    if (profileError || !profile) {
      console.error('❌ Debug user not found. Please register first.');
      process.exit(1);
    }

    const clinicaId = '60f57721-234a-4192-b81f-a294a2d93332'; // Force user ID from logs
    console.log(`✓ Found clinic ID: ${clinicaId} (FORCED)`);

    // Create WhatsApp instance with correct instance_id format
    const correctInstanceId = `clinic_${clinicaId}`;
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .upsert({
        clinica_id: clinicaId,
        name: 'Debug Instance',
        instance_id: correctInstanceId,
        status: 'connected'
      }, { onConflict: 'instance_id' })
      .select()
      .single();

    if (instanceError) {
      console.error('❌ Error creating instance:', instanceError);
      process.exit(1);
    }

    console.log('✓ WhatsApp instance created/updated');

    // Create chat
    const { data: chat, error: chatError } = await supabase
      .from('whatsapp_chats')
      .upsert({
        instance_id: instance.id,
        remote_jid: '5511888888888@s.whatsapp.net',
        name: 'Debug Patient',
        profile_pic_url: 'https://github.com/shadcn.png',
        unread_count: 1,
        last_message_content: 'Debug message link checks',
        last_message_time: new Date().toISOString(),
        status: 'open'
      }, { onConflict: 'instance_id,remote_jid' })
      .select()
      .single();

    if (chatError) {
      console.error('❌ Error creating chat:', chatError);
      process.exit(1);
    }

    console.log('✓ Chat created/updated');

    // Create message
    const { error: messageError } = await supabase
      .from('whatsapp_messages')
      .insert({
        chat_id: chat.id,
        content: 'Hello world',
        from_me: false,
        created_at: new Date().toISOString()
      });

    if (messageError) {
      console.error('❌ Error creating message:', messageError);
      process.exit(1);
    }

    console.log('✓ Message created');
    console.log('\n✅ Seed completed successfully!');
    console.log('🔄 Refresh the CRM page to see the changes.');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

seedDebugData();

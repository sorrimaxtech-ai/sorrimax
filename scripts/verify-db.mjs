import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://irqlxtyvtpsnteqbdsix.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycWx4dHl2dHBzbnRlcWJkc2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3OTk4ODIsImV4cCI6MjA4MjM3NTg4Mn0.kEfrwGuJr_MCSerLT5UBZsOEoLhLRoeziAxT49Wjijw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyData() {
  console.log('🔍 Verifying database state...\n');
  
  // 1. Check instances
  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('*');
  
  console.log(`✓ WhatsApp Instances (${instances?.length || 0}):`);
  instances?.forEach(i => console.log(`  - ${i.instance_id} (${i.status})`));
  
  // 2. Check chats
  const { data: chats } = await supabase
    .from('whatsapp_chats')
    .select('*');
  
  console.log(`\n✓ WhatsApp Chats (${chats?.length || 0}):`);
  chats?.forEach(c => console.log(`  - ${c.name} (${c.remote_jid}) - unread: ${c.unread_count}`));
  
  // 3. Check messages
  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('*');
  
  console.log(`\n✓ WhatsApp Messages (${messages?.length || 0})`);
  
  // 4. Check leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*');
  
  console.log(`\n✓ Leads (${leads?.length || 0}):`);
  leads?.forEach(l => console.log(`  - ${l.nome} (${l.telefone}) - unread: ${l.unread_messages}`));
  
  // 5. Check if instance_id matches
  console.log('\n🔗 Checking relationships:');
  if (instances && instances.length > 0 && chats && chats.length > 0) {
    const instanceIds = instances.map(i => i.id);
    const chatInstanceIds = chats.map(c => c.instance_id);
    console.log(`  Instance IDs: ${instanceIds.join(', ')}`);
    console.log(`  Chat instance_ids: ${chatInstanceIds.join(', ')}`);
    console.log(`  Match: ${chatInstanceIds.every(id => instanceIds.includes(id))}`);
  }
}

verifyData();

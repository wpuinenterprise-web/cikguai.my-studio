import { createClient } from '@supabase/supabase-js';

// OLD Supabase Project - azmeer_ai_studio_2026
const OLD_SUPABASE_URL = 'https://detznytjwofbqrvwqcdx.supabase.co';
const OLD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHpueXRqd29mYnFydndxY2R4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY2NTU2MywiZXhwIjoyMDgyMjQxNTYzfQ.ffrRQY06-5-UDUPnX9VHvqczNqznIEobs_CtZhcJGeY';

// NEW Supabase Project - cikguai.my
const NEW_SUPABASE_URL = 'https://yhlvjgijnfqfuiqpixas.supabase.co';
const NEW_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobHZqZ2lqbmZxZnVpcXBpeGFzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI5NTkxNywiZXhwIjoyMDg0ODcxOTE3fQ.jd6Q6YjzmELC3TZDBNYUqoAdvV0tRj7KeirprQEosWI';

// Initialize Supabase clients
const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SERVICE_KEY);
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SERVICE_KEY);

// Tables to migrate - in order of dependencies
const TABLES = [
  'profiles',
  'referrals',
  'video_generations',
  'image_generations',
  'app_settings',
  'automation_workflows',
  'automation_schedules',
  'automation_queue',
  'api_keys',
  'subscription_plans',
  'user_subscriptions'
];

// Storage buckets to migrate
const STORAGE_BUCKETS = [
  'product-images',
  'reference-images',
  'video-references'
];

async function getTableData(supabase, tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*');

    if (error) {
      console.log(`⚠️  Table ${tableName}: ${error.message}`);
      return [];
    }

    return data || [];
  } catch (err) {
    console.log(`⚠️  Table ${tableName}: ${err.message}`);
    return [];
  }
}

async function insertTableData(supabase, tableName, data) {
  if (!data || data.length === 0) {
    console.log(`ℹ️  Table ${tableName}: No data to insert`);
    return;
  }

  try {
    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const { error } = await supabase
        .from(tableName)
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

      if (error) {
        console.log(`❌ Table ${tableName} batch ${i / batchSize + 1}: ${error.message}`);
      } else {
        console.log(`✅ Table ${tableName}: Inserted batch ${i / batchSize + 1} (${batch.length} rows)`);
      }
    }
  } catch (err) {
    console.log(`❌ Table ${tableName}: ${err.message}`);
  }
}

async function migrateStorage(bucketName) {
  console.log(`\n📦 Migrating storage bucket: ${bucketName}`);

  try {
    // Check if bucket exists in old project
    const { data: files, error: listError } = await oldSupabase.storage
      .from(bucketName)
      .list('', { limit: 1000 });

    if (listError) {
      console.log(`⚠️  Bucket ${bucketName}: ${listError.message}`);
      return;
    }

    if (!files || files.length === 0) {
      console.log(`ℹ️  Bucket ${bucketName}: No files to migrate`);
      return;
    }

    // Create bucket in new project if not exists
    try {
      await newSupabase.storage.createBucket(bucketName, { public: true });
      console.log(`✅ Created bucket ${bucketName} in new project`);
    } catch (err) {
      // Bucket might already exist
    }

    // Download and upload each file
    for (const file of files) {
      if (file.name === '.emptyFolderPlaceholder') continue;

      const filePath = file.name;

      // Download from old project
      const { data: fileData, error: downloadError } = await oldSupabase.storage
        .from(bucketName)
        .download(filePath);

      if (downloadError) {
        console.log(`⚠️  Failed to download ${filePath}: ${downloadError.message}`);
        continue;
      }

      // Upload to new project
      const { error: uploadError } = await newSupabase.storage
        .from(bucketName)
        .upload(filePath, fileData, { upsert: true });

      if (uploadError) {
        console.log(`⚠️  Failed to upload ${filePath}: ${uploadError.message}`);
      } else {
        console.log(`✅ Migrated file: ${filePath}`);
      }
    }

    console.log(`✅ Completed migration of bucket: ${bucketName}`);
  } catch (err) {
    console.log(`❌ Bucket ${bucketName}: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 Starting Supabase Migration');
  console.log('================================');
  console.log(`From: ${OLD_SUPABASE_URL}`);
  console.log(`To: ${NEW_SUPABASE_URL}`);
  console.log('================================\n');

  // Test connections
  console.log('Testing connections...');

  const { data: oldTest, error: oldError } = await oldSupabase.from('profiles').select('count').limit(1);
  if (oldError) {
    console.log('❌ Cannot connect to OLD Supabase:', oldError.message);
  } else {
    console.log('✅ Connected to OLD Supabase');
  }

  const { data: newTest, error: newError } = await newSupabase.from('profiles').select('count').limit(1);
  if (newError && !newError.message.includes('does not exist')) {
    console.log('❌ Cannot connect to NEW Supabase:', newError.message);
  } else {
    console.log('✅ Connected to NEW Supabase');
  }

  console.log('\n📊 MIGRATING DATABASE TABLES');
  console.log('============================\n');

  // Migrate each table
  for (const tableName of TABLES) {
    console.log(`\n📋 Processing table: ${tableName}`);

    // Get data from old project
    const data = await getTableData(oldSupabase, tableName);
    console.log(`   Found ${data.length} rows in old project`);

    // Insert into new project
    if (data.length > 0) {
      await insertTableData(newSupabase, tableName, data);
    }
  }

  console.log('\n📦 MIGRATING STORAGE BUCKETS');
  console.log('============================\n');

  // Migrate storage buckets
  for (const bucketName of STORAGE_BUCKETS) {
    await migrateStorage(bucketName);
  }

  console.log('\n================================');
  console.log('🎉 Migration Complete!');
  console.log('================================');
}

main().catch(console.error);

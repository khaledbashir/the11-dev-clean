#!/usr/bin/env node

/**
 * Diagnostic script to check rate card roles in the database
 * This helps verify if roles exist and are accessible
 */

const mysql = require('mysql2/promise');

// Database configuration (use environment variables)
const dbConfig = {
  host: process.env.DB_HOST || 'ahmad_mysql-database',
  user: process.env.DB_USER || 'sg_sow_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'socialgarden_sow',
  port: parseInt(process.env.DB_PORT || '3306'),
};

async function checkRateCardRoles() {
  let connection;
  
  try {
    console.log('🔍 Connecting to database...');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    // Check if table exists
    console.log('📋 Step 1: Checking if rate_card_roles table exists...');
    const [tables] = await connection.execute(
      `SELECT COUNT(*) as count 
       FROM information_schema.tables 
       WHERE table_schema = ? AND table_name = 'rate_card_roles'`,
      [dbConfig.database]
    );
    
    if (tables[0].count === 0) {
      console.log('❌ ERROR: rate_card_roles table does NOT exist!\n');
      console.log('💡 Solution: Run the migration script:');
      console.log('   ./scripts/migrate-rate-card.sh\n');
      return;
    }
    
    console.log('✅ Table exists\n');

    // Count total roles
    console.log('📊 Step 2: Counting roles...');
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM rate_card_roles'
    );
    const totalCount = countResult[0].total;
    console.log(`   Total roles in table: ${totalCount}`);

    // Count active roles
    const [activeResult] = await connection.execute(
      'SELECT COUNT(*) as active FROM rate_card_roles WHERE is_active = TRUE'
    );
    const activeCount = activeResult[0].active;
    console.log(`   Active roles: ${activeCount}\n`);

    if (totalCount === 0) {
      console.log('❌ ERROR: Table exists but contains NO roles!\n');
      console.log('💡 Solution: Run the migration script to seed data:');
      console.log('   ./scripts/migrate-rate-card.sh\n');
      return;
    }

    if (activeCount === 0) {
      console.log('⚠️  WARNING: All roles are marked as inactive (is_active = FALSE)\n');
      console.log('💡 Solution: Check the database and activate roles, or re-run migration\n');
    }

    // Show sample roles
    console.log('📋 Step 3: Sample roles (first 10):');
    const [sampleRoles] = await connection.execute(
      `SELECT role_name, hourly_rate, is_active 
       FROM rate_card_roles 
       ORDER BY role_name ASC 
       LIMIT 10`
    );
    
    if (sampleRoles.length > 0) {
      sampleRoles.forEach((role, index) => {
        const status = role.is_active ? '✅' : '❌';
        console.log(`   ${index + 1}. ${status} ${role.role_name} - $${role.hourly_rate}/hr`);
      });
      console.log('');
    }

    // Show rate statistics
    console.log('📊 Step 4: Rate statistics:');
    const [stats] = await connection.execute(
      `SELECT 
         MIN(hourly_rate) as min_rate,
         MAX(hourly_rate) as max_rate,
         AVG(hourly_rate) as avg_rate
       FROM rate_card_roles 
       WHERE is_active = TRUE`
    );
    
    if (stats[0].min_rate) {
      console.log(`   Minimum rate: $${parseFloat(stats[0].min_rate).toFixed(2)}/hr`);
      console.log(`   Maximum rate: $${parseFloat(stats[0].max_rate).toFixed(2)}/hr`);
      console.log(`   Average rate: $${parseFloat(stats[0].avg_rate).toFixed(2)}/hr\n`);
    }

    // Check for common expected roles
    console.log('🔍 Step 5: Checking for expected roles...');
    const expectedRoles = [
      'Tech - Head Of - Senior Project Management',
      'Account Management - Senior Account Manager',
      'Tech - Delivery - Project Coordination',
    ];
    
    for (const expectedRole of expectedRoles) {
      const [matches] = await connection.execute(
        'SELECT role_name, hourly_rate FROM rate_card_roles WHERE role_name = ? AND is_active = TRUE',
        [expectedRole]
      );
      
      if (matches.length > 0) {
        console.log(`   ✅ Found: ${expectedRole} - $${matches[0].hourly_rate}/hr`);
      } else {
        console.log(`   ❌ Missing: ${expectedRole}`);
      }
    }
    console.log('');

    console.log('✅ Diagnostic complete!\n');
    console.log('📝 Summary:');
    console.log(`   - Table exists: ✅`);
    console.log(`   - Total roles: ${totalCount}`);
    console.log(`   - Active roles: ${activeCount}`);
    console.log(`   - Status: ${activeCount > 0 ? '✅ READY' : '⚠️  NEEDS ATTENTION'}\n`);
    
    if (activeCount > 0) {
      console.log('💡 Next steps:');
      console.log('   1. Visit: https://sow.qandu.me/admin/rate-card');
      console.log('   2. You should see all ' + activeCount + ' roles listed there');
      console.log('   3. If roles are missing, check database or re-run migration\n');
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check database connection settings');
    console.error('   2. Verify DB_HOST, DB_USER, DB_PASSWORD, DB_NAME environment variables');
    console.error('   3. Ensure database is accessible from this machine\n');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the diagnostic
checkRateCardRoles();


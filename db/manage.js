import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

// Load .env file
const envContent = readFileSync('.env', 'utf-8')
const envVars = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=')
    envVars[key.trim()] = valueParts.join('=').trim()
  }
}

const supabaseUrl = envVars.VITE_SUPABASE_URL
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY
const accessToken = envVars.SUPABASE_ACCESS_TOKEN

async function setupDatabase() {
  console.log('Setting up database...\n')
  try {
    execSync('supabase db push --include-all', {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken }
    })
    console.log('\nDatabase setup complete!')
  } catch (err) {
    console.error('Failed to setup database')
  }
}

async function clearTables() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  
  console.log('Clearing tables...\n')
  
  const tables = ['analyses', 'resolutions', 'disputes', 'positions', 'trades']
  
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', 0)
    if (error) {
      console.log(`${table}: ${error.message}`)
    } else {
      console.log(`${table}: cleared`)
    }
  }
  
  console.log('\nTables cleared!')
}

async function main() {
  const command = process.argv[2]
  
  switch (command) {
    case 'setup':
      await setupDatabase()
      break
    case 'clear':
      await clearTables()
      break
    case 'reset':
      await clearTables()
      await setupDatabase()
      break
    default:
      console.log('Usage: node db/manage.js [setup|clear|reset]')
      console.log('  setup  - Create all required tables')
      console.log('  clear  - Clear all data from tables')
      console.log('  reset  - Clear data and recreate tables')
  }
}

main().catch(console.error)

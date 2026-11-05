async function printMigration() {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const sql = readFileSync(join(__dirname, 'supabase_migration_actions.sql'), 'utf8')
  console.log('Review this SQL before applying it to the intended database:')
  console.log(sql)
}

printMigration().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

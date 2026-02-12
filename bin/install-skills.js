#!/usr/bin/env node
'use strict'

const { cpSync, existsSync, mkdirSync } = require('node:fs')
const { dirname, resolve } = require('node:path')

const SKILLS_SOURCE = resolve(__dirname, '..', 'skills', 'image-generation')
const SKILL_DIR_NAME = 'image-generation'

function printHelp() {
  console.log(`
Image Generation Skills Installer

Usage:
  npx mcp-image skills install --path <path>

Options:
  --path <path>    Install skills to the specified directory.
                   The skill will be placed at <path>/${SKILL_DIR_NAME}/

  --help, -h       Show this help message

Examples:
  npx mcp-image skills install --path ~/.claude/skills
  npx mcp-image skills install --path ./.claude/skills
  npx mcp-image skills install --path /custom/path
`)
}

function parseArgs(args) {
  const options = { path: undefined, help: false }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break

      case '--path': {
        const pathArg = args[i + 1]
        if (!pathArg) {
          console.error('Error: --path requires a path argument')
          process.exit(1)
        }
        options.path = pathArg
        i++
        break
      }

      default:
        if (arg && arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`)
          process.exit(1)
        }
    }
  }

  return options
}

function install(targetPath) {
  if (!existsSync(SKILLS_SOURCE)) {
    console.error(`Error: Skills source not found at ${SKILLS_SOURCE}`)
    process.exit(1)
  }

  const targetDir = dirname(targetPath)
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
    console.log(`Created directory: ${targetDir}`)
  }

  cpSync(SKILLS_SOURCE, targetPath, { recursive: true })
  console.log(`Installed skills to: ${targetPath}`)
}

function run(args) {
  if (args.length === 0) {
    printHelp()
    process.exit(0)
  }

  const options = parseArgs(args)

  if (options.help) {
    printHelp()
    process.exit(0)
  }

  if (!options.path) {
    console.error('Error: --path is required')
    console.error('Run "npx mcp-image skills install --help" for usage information.')
    process.exit(1)
  }

  const targetPath = resolve(options.path, SKILL_DIR_NAME)

  console.log('Installing image-generation skills...')
  console.log(`Path: ${targetPath}`)
  console.log()

  install(targetPath)

  console.log()
  console.log('Installation complete!')
  console.log()
  console.log('Installed files:')
  console.log('  - image-generation/SKILL.md')
}

module.exports = { run }

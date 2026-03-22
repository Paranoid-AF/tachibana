/**
 * Ensure the server process is running with elevated privileges.
 *
 * On all platforms, if not elevated, prints instructions and exits.
 * Re-exec approaches (osascript, UAC Start-Process, pkexec) all lose
 * the terminal — stdout goes to a separate context and the user can't
 * see server logs or send signals. Asking the user to restart is the
 * only approach that preserves full terminal interactivity.
 */
export async function ensureElevated(): Promise<void> {
  if (isElevated()) return

  const cmd = process.execPath
  const args = process.argv.slice(1)
  const fullCmd = `${cmd} ${args.join(' ')}`

  if (process.platform === 'win32') {
    console.error(
      '[elevate] Administrator privileges are required for iOS device tunnels.\n' +
        'Please either:\n\n' +
        '  1. Run this terminal as Administrator, then re-run the command\n' +
        `  2. sudo ${fullCmd}   (Windows 11+)\n`
    )
  } else {
    console.error(
      '[elevate] Root privileges are required for iOS device tunnels.\n' +
        'Please re-run with sudo:\n\n' +
        `  sudo ${fullCmd}\n`
    )
  }

  process.exit(1)
}

function isElevated(): boolean {
  if (process.platform === 'win32') {
    // `fltMC` (Filter Manager) reliably returns 0 when running elevated,
    // unlike `net session` which fails under LocalSystem / service accounts.
    try {
      const result = Bun.spawnSync(['fltMC'], {
        stdout: 'ignore',
        stderr: 'ignore',
      })
      return result.exitCode === 0
    } catch {
      return false
    }
  }
  return process.getuid?.() === 0
}

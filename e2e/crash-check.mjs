// Run by reliability.e2e.mjs in its own process: crashes the app's page and reports
// whether the window came back. Playwright reports the crash as an unhandled
// "Target crashed" error, which is expected here and would fail the test runner.
import { launchApp } from './app.mjs'

process.on('unhandledRejection', (error) => {
  if (!/Target crashed/.test(String(error?.message))) throw error
})

const [scryfallApi, mtgjsonApi] = process.argv.slice(2)
const run = await launchApp({ scryfallApi, mtgjsonApi }, { files: { 'decks/Good.txt': '1 Sol Ring\n' } })
let back = false
try {
  await run.page.waitForSelector('.view')
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer())
  for (let i = 0; i < 40 && !back; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    back = await run.app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('!!document.querySelector(".view")').catch(() => false)
      )
      .catch(() => false)
  }
} finally {
  await run.close()
  run.remove()
}
console.log(back ? 'RECOVERED' : 'STILL BLANK')

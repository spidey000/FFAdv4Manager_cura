/* Glue between the upstream Symple Cura slicer and FFAdv4Manager web shell.
 * Keeps the upstream AGPL source untouched; ONLY captures its completed G-code.
 * Never issues printer commands from inside the Cura iframe.
 */
(function () {
  'use strict'
  window.ffadv4LastGcode = null
  // Ensure old Symple defaults do not override the single-printer first launch.
  if (localStorage.getItem('ffadv4-cura-profile-version') !== 'ad4-artillery-v1') {
    localStorage.removeItem('startup_config')
    localStorage.setItem('ffadv4-cura-profile-version', 'ad4-artillery-v1')
  }
  const profilesUrl = new URL('../cura-profiles/profile_list.toml', location.href).pathname
  localStorage.setItem('profile_urls', profilesUrl)

  let hookedSlicer = false
  let hookedStage = false
  const interval = setInterval(function () {
    if (!hookedSlicer && window.slicer && typeof window.slicer.readFile === 'function') {
      const client = window.slicer
      const read = client.readFile.bind(client)
      client.readFile = async function (...args) {
        const data = await read(...args)
        if (typeof data === 'string' && /^(?:G|M|T)\d+/m.test(data)) {
          window.ffadv4LastGcode = data
        }
        return data
      }
      hookedSlicer = true
    }
    if (!hookedStage && window.stage && typeof window.stage.slice === 'function') {
      const stage = window.stage
      const slice = stage.slice.bind(stage)
      stage.slice = function (...args) {
        window.ffadv4LastGcode = null
        return slice(...args)
      }
      hookedStage = true
    }
    if (hookedStage && hookedSlicer) clearInterval(interval)
  }, 100)
  setTimeout(function () { clearInterval(interval) }, 60000)
})()

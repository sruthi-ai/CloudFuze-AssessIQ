module.exports = {
  packagerConfig: {
    name: 'AssessIQ Secure Browser',
    executableName: 'assessiq-secure-browser',
    appBundleId: 'live.cftools.neutaraassessment.secure-browser',
    protocols: [{ name: 'AssessIQ', schemes: ['assessiq'] }],
    win32metadata: {
      CompanyName: 'CloudFuze',
      ProductName: 'AssessIQ Secure Browser',
    },
    // icon: './build/icon'  // add .ico/.icns when available
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'assessiq_secure_browser',
        setupExe: 'AssessIQ-Secure-Browser-Setup.exe',
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: { name: 'AssessIQ-Secure-Browser' },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'CloudFuze',
          homepage: 'https://neutaraassessment.cftools.live',
        },
      },
    },
  ],
}

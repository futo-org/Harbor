# Polycentric Mobile

## temporary notes

Android.sys.req.tested

- jvm 25
- jdk 17

must have path to sdk defined, easiest to create android/local.properties after prebuild
`sdk.dir = /path/to/sdk`

node.sys.req.tested

- node v22.4.1
- npm or yarn package managers enforced

### getting node

use nvm: https://github.com/nvm-sh/nvm

### getting yarn

just use npm, if opposed you can use yarn.

after node installation and setup

```bash
corepack enable
corepack prepare yarn@latest --activate
```

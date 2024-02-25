// For each route, create a folder with the same name and copy index.html into it
const fs = require('fs-extra')
fs.copy('CNAME', 'build/CNAME')
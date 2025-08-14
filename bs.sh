#!/bin/bash
# install dev deps
npm i

# build
npm run build
# -> dist/index.js + dist/index.d.ts

# (facoltativo) check types
npm run check

# publish (scoped package pubblico)
npm login
npm publish --access public

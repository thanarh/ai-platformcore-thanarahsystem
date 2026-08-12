---
name: MongoDB Atlas connection
description: How to connect Replit containers to MongoDB Atlas — IP whitelist and TLS config
---

## The problem
MongoDB Atlas blocks connections from IPs not in the Network Access whitelist. Replit containers use dynamic IPs (e.g. `34.14.118.19`). The error looks like:
`SSL handshake failed: TLSV1_ALERT_INTERNAL_ERROR` or `IP that isn't whitelisted`

## Fix for production
In MongoDB Atlas → Network Access → Add IP Address: add the specific container IP or `0.0.0.0/0` for development.

## Code fix (NestJS)
Use `MongooseModule.forRoot(uri, { lazyConnection: true, bufferCommands: true })` so NestJS starts immediately. Once the IP is whitelisted and the connection establishes, buffered operations flush automatically.

## Code fix (Python/Motor)
Use `tlsAllowInvalidCertificates=True` in the AsyncIOMotorClient options as first attempt; the database.py wraps attempts in try/except and starts the AI engine in degraded mode if all fail.

**Why:** `lazyConnection: true` is in `MongooseModuleOptions` (forRoot) but NOT in `MongooseModuleAsyncOptions` (forRootAsync). Must use sync forRoot with `process.env.MONGODB_URI` directly.

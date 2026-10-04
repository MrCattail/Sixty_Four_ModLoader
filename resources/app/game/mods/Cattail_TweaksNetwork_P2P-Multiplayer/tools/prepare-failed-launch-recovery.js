'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function argument(name) {
    const prefix = `--${name}=`
    const item = process.argv.find(value => String(value).startsWith(prefix))
    return item ? item.slice(prefix.length) : ''
}

function readVarint(buffer, position) {
    let value = 0
    let shift = 0
    let cursor = position
    for (let index = 0; index < 10 && cursor < buffer.length; index += 1) {
        const byte = buffer[cursor]
        cursor += 1
        value += (byte & 127) * (2 ** shift)
        if (!(byte & 128)) return [value, cursor]
        shift += 7
    }
    throw new Error('Invalid LevelDB varint.')
}

function readHandle(buffer, position) {
    const offset = readVarint(buffer, position)
    const size = readVarint(buffer, offset[1])
    return [{ offset: offset[0], size: size[0] }, size[1]]
}

function decodeSnappy(buffer) {
    const header = readVarint(buffer, 0)
    const output = Buffer.alloc(header[0])
    let inputPosition = header[1]
    let outputPosition = 0
    while (inputPosition < buffer.length && outputPosition < output.length) {
        const tag = buffer[inputPosition]
        inputPosition += 1
        const type = tag & 3
        if (type === 0) {
            let length = tag >> 2
            if (length < 60) {
                length += 1
            } else {
                const lengthBytes = length - 59
                length = 0
                for (let index = 0; index < lengthBytes; index += 1) {
                    length += buffer[inputPosition] * (2 ** (8 * index))
                    inputPosition += 1
                }
                length += 1
            }
            buffer.copy(output, outputPosition, inputPosition, inputPosition + length)
            inputPosition += length
            outputPosition += length
            continue
        }

        let length
        let offset
        if (type === 1) {
            length = ((tag >> 2) & 7) + 4
            offset = ((tag & 224) << 3) | buffer[inputPosition]
            inputPosition += 1
        } else if (type === 2) {
            length = (tag >> 2) + 1
            offset = buffer[inputPosition] | (buffer[inputPosition + 1] << 8)
            inputPosition += 2
        } else {
            length = (tag >> 2) + 1
            offset = buffer[inputPosition] |
                (buffer[inputPosition + 1] << 8) |
                (buffer[inputPosition + 2] << 16) |
                (buffer[inputPosition + 3] << 24)
            inputPosition += 4
        }
        for (let index = 0; index < length; index += 1) {
            output[outputPosition + index] = output[outputPosition - offset + index]
        }
        outputPosition += length
    }
    return output
}

function readEntries(block) {
    if (block.length < 4) return []
    const restartCount = block.readUInt32LE(block.length - 4)
    const entriesEnd = block.length - 4 - restartCount * 4
    const entries = []
    let position = 0
    let previousKey = Buffer.alloc(0)
    while (position < entriesEnd) {
        const shared = readVarint(block, position)
        const nonShared = readVarint(block, shared[1])
        const valueLength = readVarint(block, nonShared[1])
        position = valueLength[1]
        if (position + nonShared[0] + valueLength[0] > entriesEnd) break
        const key = Buffer.concat([
            previousKey.subarray(0, shared[0]),
            block.subarray(position, position + nonShared[0])
        ])
        position += nonShared[0]
        const value = block.subarray(position, position + valueLength[0])
        position += valueLength[0]
        previousKey = key
        entries.push([key, value])
    }
    return entries
}

function readBlock(file, handle) {
    const raw = file.subarray(handle.offset, handle.offset + handle.size)
    const compression = file[handle.offset + handle.size]
    if (compression === 0) return raw
    if (compression === 1) return decodeSnappy(raw)
    return null
}

function readLatestMainSave(levelDbPath, steamId) {
    const keyFragment = `abstractv03${steamId}`
    let latest = null
    const files = fs.readdirSync(levelDbPath).filter(name => name.endsWith('.ldb')).sort()
    for (const name of files) {
        const file = fs.readFileSync(path.join(levelDbPath, name))
        if (file.length < 48) continue
        try {
            const footer = file.subarray(file.length - 48)
            const metaHandle = readHandle(footer, 0)
            const indexHandle = readHandle(footer, metaHandle[1])[0]
            const indexBlock = readBlock(file, indexHandle)
            if (!indexBlock) continue
            for (const indexEntry of readEntries(indexBlock)) {
                const dataHandle = readHandle(indexEntry[1], 0)[0]
                const dataBlock = readBlock(file, dataHandle)
                if (!dataBlock) continue
                for (const entry of readEntries(dataBlock)) {
                    const internalKey = entry[0]
                    if (internalKey.length < 8) continue
                    const userKey = internalKey.subarray(0, internalKey.length - 8).toString('latin1')
                    if (!userKey.includes(keyFragment)) continue
                    const tag = internalKey.readBigUInt64LE(internalKey.length - 8)
                    const sequence = tag >> 8n
                    const type = Number(tag & 255n)
                    if (type !== 1 || (latest && sequence <= latest.sequence)) continue
                    latest = { sequence, value: entry[1], file: name }
                }
            }
        } catch (_error) {
            // A malformed or unsupported table cannot override a valid newer entry.
        }
    }
    if (!latest) throw new Error(`Could not find ${keyFragment} in ${levelDbPath}`)
    const encoded = latest.value[0] === 1
        ? latest.value.subarray(1).toString('utf8')
        : latest.value.toString('utf16le').slice(1)
    return { encoded, sequence: String(latest.sequence), file: latest.file }
}

function decodeSave(encoded, label) {
    let decoded
    try {
        decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    } catch (error) {
        throw new Error(`${label} is not a valid Base64 JSON save: ${error.message}`)
    }
    if (!Array.isArray(decoded.resources) || !Array.isArray(decoded.stuff)) {
        throw new Error(`${label} does not have the expected Sixty Four save fields.`)
    }
    return decoded
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function writeNew(filePath, value) {
    if (fs.existsSync(filePath)) throw new Error(`Refusing to overwrite ${filePath}`)
    fs.writeFileSync(filePath, value, 'utf8')
}

const beforeLevelDb = argument('before-leveldb')
const currentLevelDb = argument('current-leveldb')
const cloudPath = argument('cloud')
const outputPath = argument('output')
const steamId = argument('steam-id') || '1314984391'
if (!beforeLevelDb || !currentLevelDb || !cloudPath || !outputPath) {
    throw new Error('Required arguments: before-leveldb, current-leveldb, cloud, output.')
}
fs.mkdirSync(outputPath, { recursive: true })

const before = readLatestMainSave(beforeLevelDb, steamId)
const current = readLatestMainSave(currentLevelDb, steamId)
const cloud = fs.readFileSync(cloudPath, 'utf8').trim()
const beforeDecoded = decodeSave(before.encoded, 'Prelaunch save')
const currentDecoded = decodeSave(current.encoded, 'Current local save')
const cloudDecoded = decodeSave(cloud, 'Current Steam Cloud cache')

writeNew(path.join(outputPath, 'prelaunch-restore-SFSaveFile.txt'), before.encoded)
writeNew(path.join(outputPath, 'failed-current-local-SFSaveFile.txt'), current.encoded)
writeNew(path.join(outputPath, 'failed-current-cloud-SFSaveFile.txt'), cloud)

const manifest = {
    createdAt: new Date().toISOString(),
    steamId,
    prelaunch: {
        timestamp: beforeDecoded.timestamp,
        sequence: before.sequence,
        sourceTable: before.file,
        bytes: Buffer.byteLength(before.encoded),
        sha256: sha256(before.encoded),
        enabledMods: beforeDecoded.modloader && beforeDecoded.modloader.enabledMods || null
    },
    failedCurrentLocal: {
        timestamp: currentDecoded.timestamp,
        sequence: current.sequence,
        sourceTable: current.file,
        bytes: Buffer.byteLength(current.encoded),
        sha256: sha256(current.encoded),
        enabledMods: currentDecoded.modloader && currentDecoded.modloader.enabledMods || null
    },
    failedCurrentCloud: {
        timestamp: cloudDecoded.timestamp,
        bytes: Buffer.byteLength(cloud),
        sha256: sha256(cloud),
        enabledMods: cloudDecoded.modloader && cloudDecoded.modloader.enabledMods || null
    }
}
writeNew(path.join(outputPath, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
process.stdout.write(`P2P_RECOVERY_PREPARED=${outputPath}\n`)
process.stdout.write(`P2P_RECOVERY_PRELAUNCH_SHA256=${manifest.prelaunch.sha256}\n`)
process.stdout.write(`P2P_RECOVERY_CURRENT_LOCAL_SHA256=${manifest.failedCurrentLocal.sha256}\n`)
process.stdout.write(`P2P_RECOVERY_CURRENT_CLOUD_SHA256=${manifest.failedCurrentCloud.sha256}\n`)

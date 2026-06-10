// Assembles a directory of sequentially named JPEG frames into an H.264 mp4.
// Usage: swift scripts/assemble-frames.swift <framesDir> <fps> <outPath> [width] [height] [bitrate]
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else {
    print("usage: assemble-frames.swift <framesDir> <fps> <outPath> [width] [height] [bitrate]")
    exit(1)
}
let framesDir = args[1]
let fps = Int32(args[2]) ?? 30
let outPath = args[3]
let outW = args.count > 4 ? Int(args[4])! : 1440
let outH = args.count > 5 ? Int(args[5])! : 1080
let bitrate = args.count > 6 ? Int(args[6])! : 2_400_000

let fm = FileManager.default
let files = try fm.contentsOfDirectory(atPath: framesDir).filter { $0.hasSuffix(".jpg") }.sorted()
guard !files.isEmpty else { print("no frames in \(framesDir)"); exit(1) }
print("\(files.count) frames → \(outW)x\(outH) @ \(fps)fps, \(bitrate / 1000)kbps")

let outURL = URL(fileURLWithPath: outPath)
try? fm.removeItem(at: outURL)
let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: outW,
    AVVideoHeightKey: outH,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: 90,
    ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: outW,
        kCVPixelBufferHeightKey as String: outH,
    ]
)
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func makePixelBuffer(from image: CGImage) -> CVPixelBuffer? {
    var pb: CVPixelBuffer?
    let attrs: [String: Any] = [kCVPixelBufferCGImageCompatibilityKey as String: true]
    CVPixelBufferCreate(nil, outW, outH, kCVPixelFormatType_32ARGB, attrs as CFDictionary, &pb)
    guard let buffer = pb else { return nil }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let ctx = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer),
        width: outW, height: outH, bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: outW, height: outH))
    return buffer
}

var i = 0
for f in files {
    let url = URL(fileURLWithPath: framesDir).appendingPathComponent(f)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    while !input.isReadyForMoreMediaData { usleep(2000) }
    guard let buf = makePixelBuffer(from: img) else { print("pixel buffer failed at \(f)"); exit(1) }
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
    i += 1
    if i % 200 == 0 { print("\(i)/\(files.count)") }
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
if writer.status == .completed {
    let size = (try? fm.attributesOfItem(atPath: outPath)[.size] as? Int) ?? 0
    print("wrote \(outPath): \(i) frames, \((size ?? 0) / 1_000_000) MB")
} else {
    print("writer failed: \(String(describing: writer.error))")
    exit(1)
}

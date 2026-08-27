// Dump N evenly spaced frames from a video as PNGs. AVFoundation only -- there is no
// ffmpeg on this machine, and AVAssetImageGenerator is the native way in.
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else { fputs("usage: dumpframes <in.mp4> <outdir> <count>\n", stderr); exit(2) }
let url = URL(fileURLWithPath: args[1])
let outDir = args[2]
let count = Int(args[3]) ?? 12

let asset = AVURLAsset(url: url)
let dur = CMTimeGetSeconds(asset.duration)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
// Zero tolerance or the generator returns the same keyframe repeatedly.
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

for i in 0..<count {
    let t = dur * Double(i) / Double(count)
    let time = CMTime(seconds: t, preferredTimescale: 600)
    do {
        let cg = try gen.copyCGImage(at: time, actualTime: nil)
        let rep = NSBitmapImageRep(cgImage: cg)
        guard let data = rep.representation(using: .png, properties: [:]) else { continue }
        let path = String(format: "%@/f%03d.png", outDir, i)
        try data.write(to: URL(fileURLWithPath: path))
    } catch {
        fputs("frame \(i) at \(t)s failed: \(error)\n", stderr)
    }
}
print("duration=\(dur) frames=\(count) -> \(outDir)")

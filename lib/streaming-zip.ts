import { Zip, ZipPassThrough } from "fflate";

export type StreamingZipEntry = {
  filename: string;
  data: () => Promise<Uint8Array>;
};

export function createStreamingZip(entries: StreamingZipEntry[]) {
  let archive: Zip | undefined;
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let finished = false;
      archive = new Zip((error, chunk, final) => {
        if (finished || cancelled) return;
        if (error) {
          finished = true;
          controller.error(error);
          return;
        }
        if (chunk.length) controller.enqueue(chunk);
        if (final) {
          finished = true;
          controller.close();
        }
      });

      void (async () => {
        try {
          for (const entry of entries) {
            if (cancelled) return;
            const file = new ZipPassThrough(entry.filename);
            archive?.add(file);
            file.push(await entry.data(), true);
          }
          archive?.end();
        } catch (error) {
          archive?.terminate();
          if (!finished && !cancelled) {
            finished = true;
            controller.error(error);
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
      archive?.terminate();
    },
  });
}

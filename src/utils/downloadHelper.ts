export interface DownloadProgressInfo {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  loadedMb: string;
}

/**
 * Fetches an MP4 stream into a same-origin Blob with live byte progress and triggers
 * a browser file save. Using a same-origin `blob:` URL guarantees that `<a download>`
 * works reliably inside sandboxed cross-origin preview iframes even after async preparation.
 */
export async function downloadMp4BlobToDevice(
  url: string,
  filename: string,
  onProgress?: (info: DownloadProgressInfo) => void
): Promise<{ ok: boolean; sizeBytes: number; sizeFormatted: string; error?: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to download MP4`);
    }

    const contentLengthHeader = res.headers.get('content-length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    if (!res.body) {
      const blob = await res.blob();
      const sizeBytes = blob.size;
      const sizeFormatted = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
      triggerSameOriginBlobSave(blob, filename);
      onProgress?.({
        percent: 100,
        loadedBytes: sizeBytes,
        totalBytes: sizeBytes,
        loadedMb: sizeFormatted,
      });
      return { ok: true, sizeBytes, sizeFormatted };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        const percent =
          totalBytes > 0
            ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100))
            : Math.min(95, Math.round((loadedBytes / (2.5 * 1024 * 1024)) * 100));
        onProgress?.({
          percent,
          loadedBytes,
          totalBytes,
          loadedMb: `${(loadedBytes / (1024 * 1024)).toFixed(2)} MB`,
        });
      }
    }

    const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
    const sizeBytes = blob.size;
    const sizeFormatted = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;

    onProgress?.({
      percent: 100,
      loadedBytes: sizeBytes,
      totalBytes: sizeBytes,
      loadedMb: sizeFormatted,
    });

    triggerSameOriginBlobSave(blob, filename);
    return { ok: true, sizeBytes, sizeFormatted };
  } catch (err: any) {
    return {
      ok: false,
      sizeBytes: 0,
      sizeFormatted: '0 MB',
      error: err?.message || 'Failed to save MP4 file',
    };
  }
}

function triggerSameOriginBlobSave(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 30000);
}

/**
 * Downloads a cover image (JPEG/PNG/WebP) via same-origin Blob URL so that browser saves
 * work reliably inside cross-origin sandboxed preview iframes.
 */
export async function downloadImageBlobToDevice(
  imageUrl: string,
  filename: string
): Promise<{ ok: boolean; sizeBytes: number; sizeFormatted: string; error?: string }> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to fetch cover image`);
    }
    const rawBlob = await res.blob();
    const mimeType =
      rawBlob.type && rawBlob.type.startsWith('image/')
        ? rawBlob.type
        : filename.endsWith('.png')
          ? 'image/png'
          : 'image/jpeg';
    const blob = new Blob([rawBlob], { type: mimeType });
    const sizeBytes = blob.size;
    const sizeFormatted =
      sizeBytes >= 1024 * 1024
        ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;

    triggerSameOriginBlobSave(blob, filename);
    return { ok: true, sizeBytes, sizeFormatted };
  } catch (err: any) {
    return {
      ok: false,
      sizeBytes: 0,
      sizeFormatted: '0 KB',
      error: err?.message || 'Failed to download cover image',
    };
  }
}

/**
 * Captures the current live video frame from an HTMLVideoElement (or falls back to the poster URL)
 * onto a high-resolution canvas, optionally stamps an episode cover badge, and saves it as a JPEG.
 */
export async function captureVideoFrameToDevice(
  videoEl: HTMLVideoElement | null,
  filename: string,
  options?: {
    fallbackPosterUrl?: string;
    badgeText?: string;
    subBadgeText?: string;
  }
): Promise<{ ok: boolean; sizeFormatted: string; resolution: string; error?: string }> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    let width = videoEl?.videoWidth || 480;
    let height = videoEl?.videoHeight || 854;
    let drewVideo = false;

    if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(videoEl, 0, 0, width, height);
      drewVideo = true;
    } else if (options?.fallbackPosterUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load fallback poster image'));
        img.src = options.fallbackPosterUrl!;
      });
      width = img.naturalWidth || 480;
      height = img.naturalHeight || 854;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      drewVideo = true;
    }

    if (!drewVideo) {
      throw new Error('Video frame not ready yet');
    }

    if (options?.badgeText) {
      const grad = ctx.createLinearGradient(0, height - 130, 0, height);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, height - 130, width, 130);

      ctx.fillStyle = '#2DD4BF';
      ctx.font = `bold ${Math.round(width * 0.038)}px sans-serif`;
      ctx.fillText(options.badgeText, Math.round(width * 0.05), height - Math.round(height * 0.065));

      if (options.subBadgeText) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `600 ${Math.round(width * 0.042)}px sans-serif`;
        ctx.fillText(
          options.subBadgeText.slice(0, 38),
          Math.round(width * 0.05),
          height - Math.round(height * 0.03)
        );
      }
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95)
    );
    if (!blob) {
      throw new Error('Failed to encode cover image JPEG');
    }

    const sizeFormatted = `${Math.max(1, Math.round(blob.size / 1024))} KB`;
    triggerSameOriginBlobSave(blob, filename.endsWith('.jpg') ? filename : `${filename}.jpg`);
    return {
      ok: true,
      sizeFormatted,
      resolution: `${width}×${height}`,
    };
  } catch (err: any) {
    if (options?.fallbackPosterUrl) {
      const fallbackRes = await downloadImageBlobToDevice(options.fallbackPosterUrl, filename);
      if (fallbackRes.ok) {
        return {
          ok: true,
          sizeFormatted: fallbackRes.sizeFormatted,
          resolution: '480×854',
        };
      }
    }
    return {
      ok: false,
      sizeFormatted: '0 KB',
      resolution: '0×0',
      error: err?.message || 'Could not capture frame',
    };
  }
}


export function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function saveBackupText(text: string, fileName: string) {
  let supportsNativeSave = false;
  let nativeFile: typeof import('@apps-in-toss/web-framework').File | null = null;
  try {
    nativeFile = (await import('@apps-in-toss/web-framework')).File;
    supportsNativeSave = nativeFile.saveBase64.isSupported();
  } catch {
    supportsNativeSave = false;
  }
  if (supportsNativeSave) {
    await nativeFile!.saveBase64({
      data: encodeUtf8Base64(text),
      fileName,
      mimeType: 'application/json',
    });
    return;
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

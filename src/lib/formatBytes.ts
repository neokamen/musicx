export function formatDataSizeParts(bytes: number): { value: string; unit: string } {
  if (bytes < 1024) return { value: bytes.toFixed(0), unit: "B" };
  if (bytes < 1024 * 1024) return { value: (bytes / 1024).toFixed(1), unit: "KB" };
  if (bytes < 1024 * 1024 * 1024) return { value: (bytes / (1024 * 1024)).toFixed(2), unit: "MB" };
  return { value: (bytes / (1024 * 1024 * 1024)).toFixed(2), unit: "GB" };
}

export function formatDataSize(bytes: number): string {
  const { value, unit } = formatDataSizeParts(bytes);
  return `${value} ${unit}`;
}

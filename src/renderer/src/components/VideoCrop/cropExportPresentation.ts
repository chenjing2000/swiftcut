import type { CropExportState, CropExportStatus } from '../../../../main/videoCropExportService.js';

interface Presentation {
  active: boolean;
  title: string;
  label: string;
}

const presentations: Record<CropExportState, Presentation> = {
  preparing: { active: true, title: 'Exporting cropped video', label: 'Preparing crop export' },
  encoding: { active: true, title: 'Exporting cropped video', label: 'Encoding crop video' },
  merging: { active: true, title: 'Exporting cropped video', label: 'Merging crop segments' },
  verifying: { active: true, title: 'Exporting cropped video', label: 'Verifying crop output' },
  committing: { active: true, title: 'Exporting cropped video', label: 'Saving crop output' },
  cleaning: { active: true, title: 'Exporting cropped video', label: 'Cleaning crop temporary files' },
  success: { active: false, title: 'Crop export completed', label: 'Completed' },
  partial_success: { active: false, title: 'Crop export partially completed', label: 'Partially completed' },
  failed: { active: false, title: 'Crop export failed', label: 'Failed' },
  cancelled: { active: false, title: 'Crop export cancelled', label: 'Cancelled' },
};

export function getCropExportPresentation(status: Pick<CropExportStatus, 'state'>): Presentation {
  return presentations[status.state];
}

/** Present the current segment (1-based), rather than the number already finished. */
export function getCropExportSegmentPosition(status: Pick<CropExportStatus, 'state' | 'completedSegments' | 'totalSegments'>) {
  const total = Math.max(1, status.totalSegments ?? 1);
  const completed = Math.max(0, status.completedSegments ?? 0);
  const processingSegment = ['preparing', 'encoding', 'verifying'].includes(status.state);
  return { current: Math.min(total, Math.max(1, completed + (processingSegment ? 1 : 0))), total };
}

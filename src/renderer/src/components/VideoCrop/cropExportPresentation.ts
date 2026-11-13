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

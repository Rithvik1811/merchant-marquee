export interface Photo {
  name: string;
  url: string;
  file?: File; // original File object kept for FormData upload to backend
}

export interface Direction {
  moodWords: string[];
  referenceAd: string;
  neverDo: string[];
  notes: string;
}

export class EzSaveError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string
  ) {
    super(message);
    this.name = 'EzSaveError';
  }
}

export function userMessageForError(error: unknown, fallback = "EZSave couldn't complete that request."): string {
  if (error instanceof EzSaveError) {
    return error.userMessage;
  }

  return fallback;
}

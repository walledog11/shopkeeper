declare const helpers: {
  getOutboundRecordPath: () => string;
  readOutboundRecords: () => Promise<unknown[]>;
  waitForOutboundRecord: <RecordType = unknown>(
    predicate: (record: RecordType) => boolean,
    options?: { timeoutMs?: number; intervalMs?: number },
  ) => Promise<RecordType>;
};

export = helpers;

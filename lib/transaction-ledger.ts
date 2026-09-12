/** SQL is exported so failure cases can be checked against SQLite as well as D1. */
export const SIGNED_JOB_SQL = `UPDATE transactions SET signed=?,signature=?,status='signed',updated_at=?
WHERE id=? AND launch_id=? AND status='prepared' AND signature IS NULL
AND EXISTS(SELECT 1 FROM launches WHERE id=? AND revision=? AND lock_token=? AND lock_until>?)`;
export const SIGNED_ENGINE_SQL = `UPDATE launches SET engine=?,revision=revision+1,status=?,updated_at=?
WHERE changes()=1 AND id=? AND revision=? AND lock_token=? AND lock_until>?
AND EXISTS(SELECT 1 FROM transactions WHERE id=? AND launch_id=? AND signature=? AND status='signed' AND updated_at=?)`;
export type SignedWrite = {
  launchId: string;
  jobId: string;
  revision: number;
  lockToken: string | null;
  now: number;
  engine: string;
  status: string;
  signed: string;
  signature: string;
};
export function signedWriteStatements(v: SignedWrite) {
  return [
    {
      sql: SIGNED_JOB_SQL,
      args: [
        v.signed,
        v.signature,
        v.now,
        v.jobId,
        v.launchId,
        v.launchId,
        v.revision,
        v.lockToken,
        v.now,
      ],
    },
    {
      sql: SIGNED_ENGINE_SQL,
      args: [
        v.engine,
        v.status,
        v.now,
        v.launchId,
        v.revision,
        v.lockToken,
        v.now,
        v.jobId,
        v.launchId,
        v.signature,
        v.now,
      ],
    },
  ];
}

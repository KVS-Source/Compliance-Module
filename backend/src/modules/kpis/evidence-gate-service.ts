import { AppError } from "../../common/errors/app-error.js";

export class EvidenceGateService {
  assertSatisfied(requiresEvidence: boolean): true {
    if (requiresEvidence) {
      throw new AppError(
        501,
        "EVIDENCE_GATE_NOT_IMPLEMENTED",
        "KPI actual approval requires evidence support that is not implemented",
      );
    }
    return true;
  }
}

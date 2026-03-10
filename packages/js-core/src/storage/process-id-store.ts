import { IProcessIdRepository } from "../platform-interfaces";
import { Process } from "../proto/polycentric";

export class ProcessIdStore {
  constructor(private readonly repository: IProcessIdRepository) {}

  async getProcessId(): Promise<Process | null> {
    const processId = await this.repository.getProcessId();
    return processId;
  }

  async setProcessId(processId: Process): Promise<void> {
    await this.repository.setProcessId(processId);
  }
}

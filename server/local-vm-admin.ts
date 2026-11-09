// Operator opt-in for a development desktop. Keep host namespaces, devices and Docker's seccomp isolation.
export function localVmAdminEnabled(): boolean {
  return process.env.OMB_LOCAL_VM_ADMIN === "1";
}

// Docker's ordinary root capabilities: sudo, apt/dpkg, ownership and permissions work inside the container.
export const LOCAL_VM_ADMIN_CAPS = [
  "AUDIT_WRITE", "CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL", "MKNOD",
  "NET_BIND_SERVICE", "NET_RAW", "SETFCAP", "SETGID", "SETPCAP", "SETUID", "SYS_CHROOT",
];

export function localVmMemoryGb(): number {
  const n = Number(process.env.OMB_LOCAL_VM_MEMORY_GB);
  return Number.isInteger(n) && n >= 4 && n <= 32 ? n : 4;
}

export function localVmHomeDir(workspace: string): string {
  return `${workspace}-state`;
}

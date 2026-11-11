import { afterEach, expect, it, vi } from "vitest";
import { containerRunArgs } from "./container-computer.ts";
import { dockerSecurityIsHardened } from "./container-isolation.ts";
import { LOCAL_VM_ADMIN_CAPS } from "./local-vm-admin.ts";

afterEach(() => vi.unstubAllEnvs());

it("opts into ordinary root capabilities and durable home without host privileges", () => {
  vi.stubEnv("OMB_LOCAL_VM_ADMIN", "1");
  vi.stubEnv("OMB_LOCAL_VM_MEMORY_GB", "8");
  const args = containerRunArgs("docker", "test-only");
  expect(args).toContain("CHOWN");
  expect(args).toContain("DAC_OVERRIDE");
  expect(args[args.indexOf("--memory") + 1]).toBe("8g");
  expect(args).toContainEqual(expect.stringMatching(/target=\/home\/cua$/));
  expect(args).not.toContain("--privileged");
  expect(args).not.toContain("SYS_ADMIN");
  const config = { CapDrop: ["ALL"], CapAdd: LOCAL_VM_ADMIN_CAPS, Privileged: false,
    IpcMode: "private", CgroupnsMode: "private", RestartPolicy: { Name: "unless-stopped" } };
  const options = { containerAdmin: true, restartPolicy: "unless-stopped" as const };
  expect(dockerSecurityIsHardened(config, options)).toBe(true);
  expect(dockerSecurityIsHardened(config)).toBe(false);
  expect(dockerSecurityIsHardened({ ...config, CapAdd: [...LOCAL_VM_ADMIN_CAPS, "SYS_ADMIN"] }, options)).toBe(false);
  expect(dockerSecurityIsHardened({ ...config, PidMode: "host" }, options)).toBe(false);
});

it("keeps the restricted profile unless the operator enables administration", () => {
  vi.stubEnv("OMB_LOCAL_VM_ADMIN", "0");
  const args = containerRunArgs("docker");
  // The default desktop already holds the package-install set, including CHOWN. Admin mode adds only the caps beyond it.
  for (const cap of ["AUDIT_WRITE", "KILL", "MKNOD", "NET_BIND_SERVICE", "NET_RAW", "SETFCAP", "SETPCAP", "SYS_CHROOT"]) {
    expect(args, cap).not.toContain(cap);
  }
  expect(args).not.toContain("--restart");
  expect(args).not.toContainEqual(expect.stringMatching(/target=\/home\/cua$/));
});

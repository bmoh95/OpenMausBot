import { afterEach, expect, it, vi } from "vitest";
import { containerRunArgs, dockerSecurityIsHardened } from "./container-computer.ts";
import { LOCAL_VM_ADMIN_CAPS } from "./local-vm-admin.ts";

afterEach(() => vi.unstubAllEnvs());

it("opts into ordinary root capabilities and durable home without host privileges", () => {
  vi.stubEnv("OMB_LOCAL_VM_ADMIN", "1");
  vi.stubEnv("OMB_LOCAL_VM_MEMORY_GB", "8");
  const args = containerRunArgs("docker", "test-only");
  expect(args).toContain("CHOWN");
  expect(args).toContain("DAC_OVERRIDE");
  expect(args[args.indexOf("--memory") + 1]).toBe("8g");
  expect(args).toContainEqual(expect.stringContaining("target=/home/cua"));
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
  expect(containerRunArgs("docker")).not.toContain("CHOWN");
});

/**
 * Shared constants for sandbox profile catalog.
 *
 * Hard floors (HARD_FLOOR_NET_DENY) MUST be appended to every profile's
 * network.deny list — operators cannot remove these. They block the
 * 2026-05-09 recon URLs (ipinfo.io, cloud metadata endpoint).
 */

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export const NPM_CACHE_DIR = process.env.NPM_CACHE_DIR ?? "/var/cache/doable/npm";

// High-CVE syscall denylist (shared across all profiles).
// Source: gVisor's deny set + Docker's default seccomp profile.
export const HIGH_CVE_SYSCALL_DENY = [
  "bpf", "keyctl", "io_uring_setup", "io_uring_enter", "io_uring_register",
  "userfaultfd", "perf_event_open", "ptrace", "process_vm_readv", "process_vm_writev",
  "unshare", "setns", "mount", "umount", "umount2", "pivot_root", "chroot",
  "kexec_load", "kexec_file_load", "init_module", "finit_module", "delete_module",
  "create_module", "query_module", "get_kernel_syms", "syslog",
  "_sysctl", "lookup_dcookie", "uselib", "iopl", "ioperm",
];

// Hard-floor network denies — operators cannot remove these.
export const HARD_FLOOR_NET_DENY = ["ipinfo.io", "*.ipinfo.io", "169.254.169.254"];

// ─── API Client — Re-exports from domain modules ──────────
//
// All consumers should continue importing from "@/lib/api".
// The actual implementations are split into domain-specific files.

export {
  getStoredTokens,
  storeTokens,
  clearTokens,
  ApiError,
  refreshAccessToken,
  apiFetch,
} from "./api-core";

export {
  apiLogin,
  apiRegister,
  apiLogout,
  apiGetMe,
  apiForgotPassword,
  apiResetPassword,
  getGitHubLoginUrl,
  getGoogleLoginUrl,
} from "./api-auth";

export {
  type ApiProject,
  apiListProjects,
  apiListSharedProjects,
  apiGetShareStats,
  apiCreateProject,
  apiGetProject,
  apiUpdateProject,
  apiDeleteProject,
  apiDuplicateProject,
  apiToggleStarProject,
  apiListStarredProjects,
  apiListRecentlyViewed,
  apiRecordProjectView,
} from "./api-projects";

export {
  type ApiWorkspace,
  type ApiWorkspaceMember,
  type ApiWorkspaceInvite,
  apiListWorkspaces,
  apiGetWorkspace,
  apiDeleteWorkspace,
  apiListWorkspaceMembers,
  apiInviteWorkspaceMember,
  apiRemoveWorkspaceMember,
  apiUpdateWorkspaceMemberRole,
  apiAcceptWorkspaceInvite,
  apiListWorkspaceInvites,
  apiRevokeWorkspaceInvite,
  apiGenerateInviteLink,
} from "./api-workspaces";

export {
  type ApiTemplate,
  type ApiPublicProject,
  type ApiCustomDomain,
  apiListTemplates,
  apiUseTemplate,
  apiDiscoverProjects,
  apiFeaturedProjects,
  apiCommunityCategories,
  apiRemixProject,
  apiPublishProject,
  apiListCustomDomains,
  apiAddCustomDomain,
  apiRemoveCustomDomain,
  apiVerifyCustomDomain,
} from "./api-templates";

export {
  type ApiGitHubCopilotAccount,
  type ApiAiProvider,
  type ApiAiSource,
  type ApiWorkspaceAiDefaults,
  type ApiUserAiPreferences,
  type ApiEnforcementStatus,
  type ApiEffectiveAiConfig,
  type ApiUserAiAllocation,
  apiListCopilotAccounts,
  apiAddCopilotAccount,
  apiDeleteCopilotAccount,
  apiValidateCopilotAccount,
  apiListAiProviders,
  apiAddAiProvider,
  apiUpdateAiProvider,
  apiDeleteAiProvider,
  apiValidateAiProvider,
  apiGetAiDefaults,
  apiUpdateAiDefaults,
  apiGetUserAiPreferences,
  apiUpdateUserAiPreferences,
  apiListUserAllocations,
  apiUpdateUserAllocation,
  apiCopyMySettings,
  apiResetUserAllocation,
  apiGetEffectiveAiConfig,
  apiListAiModels,
} from "./api-ai";

export {
  type ApiGitHubUserStatus,
  type ApiGitHubRepo,
  apiGitHubUserStatus,
  apiGitHubListRepos,
  apiImportGitHubRepo,
  getGitHubConnectUrl,
} from "./api-github";

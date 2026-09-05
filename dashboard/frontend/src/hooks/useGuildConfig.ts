import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { AxiosError } from 'axios';

/**
 * Reusable hook for managing guild configuration sections
 * Provides data fetching, an awaited mutation, and error handling
 *
 * @template T - Type of the configuration section
 * @param guildId - Discord guild ID
 * @param section - Configuration section name (e.g., 'welcome', 'leveling', 'moderation')
 * @returns Query and mutation state with typed data
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, update, isUpdating, updateError } =
 *   useGuildConfig<WelcomeConfig>(guildId, 'welcome');
 *
 * // In your component:
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorAlert message="Failed to load config" />;
 *
 * // Update config:
 * await update({ enabled: true, message: 'Welcome!' });
 * ```
 */
export function useGuildConfig<T>(guildId: string | undefined, section: string) {
  const queryClient = useQueryClient();
  const queryKey = ['guild', guildId, 'config', section];

  // Fetch config section
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!guildId) throw new Error('Guild ID is required');

      const response = await api.get<T>(`/api/guilds/${guildId}/config/${section}`);
      return response.data;
    },
    enabled: !!guildId,
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: 2,
  });

  // Update the section and replace cached data only after the server responds.
  const {
    mutateAsync: update,
    isPending: isUpdating,
    error: updateError,
    data: updateResult,
  } = useMutation({
    mutationFn: async (updates: Partial<T>) => {
      if (!guildId) throw new Error('Guild ID is required');

      const response = await api.patch<{ success: boolean; data: T; warning?: string }>(
        `/api/guilds/${guildId}/config/${section}`,
        updates
      );
      return response.data;
    },
    onError: (error) => {
      console.error(`Failed to update ${section} config:`, error);
    },
    onSuccess: (result) => {
      // Update the cache with the server response
      queryClient.setQueryData(queryKey, result.data);
    },
  });

  return {
    /** Configuration data for the section */
    data,

    /** Whether the initial data is loading */
    isLoading,

    /** Error from fetching data */
    error: error as AxiosError | null,

    /** Refetch the configuration data */
    refetch,

    /** Update configuration and resolve with the authoritative saved section */
    update,

    /** Whether an update is in progress */
    isUpdating,

    /** Error from updating configuration */
    updateError: updateError as AxiosError | null,

    /** Non-fatal warning when settings persisted but bot cache visibility is delayed */
    updateWarning: updateResult?.warning ?? null,
  };
}

/**
 * Helper hook to get error message from Axios error
 */
export function useErrorMessage(error: AxiosError | null): string | null {
  if (!error) return null;

  if (error.response?.data) {
    const data = error.response.data as any;

    // Handle validation errors with details
    if (data.details && Array.isArray(data.details)) {
      const messages = data.details.map((d: any) => d.message || d.path?.join('.') || 'Unknown error');
      return messages.join(', ');
    }

    // Handle simple error messages
    if (data.error) return data.error;
    if (data.message) return data.message;
  }

  return error.message || 'An unexpected error occurred';
}

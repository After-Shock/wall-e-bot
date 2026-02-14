import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { AxiosError } from 'axios';

/**
 * Reusable hook for managing guild configuration sections
 * Provides data fetching, mutations with optimistic updates, and error handling
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

  // Update config section with optimistic updates
  const {
    mutate: update,
    mutateAsync: updateAsync,
    isPending: isUpdating,
    error: updateError,
  } = useMutation({
    mutationFn: async (updates: Partial<T>) => {
      if (!guildId) throw new Error('Guild ID is required');

      const response = await api.patch<{ success: boolean; data: T }>(
        `/api/guilds/${guildId}/config/${section}`,
        updates
      );
      return response.data.data;
    },
    onMutate: async (updates: Partial<T>) => {
      // Cancel any outgoing refetches to prevent them from overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousConfig = queryClient.getQueryData<T>(queryKey);

      // Optimistically update to the new value
      if (previousConfig) {
        queryClient.setQueryData<T>(queryKey, {
          ...previousConfig,
          ...updates,
        });
      }

      // Return context with the previous value for rollback
      return { previousConfig };
    },
    onError: (error, updates, context) => {
      // Rollback to the previous value on error
      if (context?.previousConfig) {
        queryClient.setQueryData(queryKey, context.previousConfig);
      }

      console.error(`Failed to update ${section} config:`, error);
    },
    onSuccess: (data) => {
      // Update the cache with the server response
      queryClient.setQueryData(queryKey, data);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we're in sync with server
      queryClient.invalidateQueries({ queryKey });
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

    /** Update configuration (fire and forget) */
    update,

    /** Update configuration (returns a promise) */
    updateAsync,

    /** Whether an update is in progress */
    isUpdating,

    /** Error from updating configuration */
    updateError: updateError as AxiosError | null,
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

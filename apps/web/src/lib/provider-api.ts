import type {
  ApiListingView,
  ConfigurePaymentRequest,
  ConfigurePricingRequest,
  CreateListingRequest,
  ErrorResponse,
  ProviderAccountView,
  RegisterProviderRequest,
  RegisterProviderResponse,
  RevenueSummaryView,
} from '@agentmarket/shared-types';
import { callApi } from './api-client';

/** Thin, typed wrappers over the control-plane endpoints — see apps/api/src/routes/control-plane/. */

export function registerProvider(input: RegisterProviderRequest) {
  return callApi<RegisterProviderResponse>('/v1/providers/register', { method: 'POST', body: input });
}

export function verifyProvider(apiKey: string) {
  return callApi<ProviderAccountView>('/v1/providers/verify', { method: 'POST', authorization: apiKey });
}

export function getProviderMe(apiKey: string) {
  return callApi<ProviderAccountView>('/v1/providers/me', { authorization: apiKey });
}

export function rotateProviderApiKey(apiKey: string) {
  return callApi<{ apiKey: string }>('/v1/providers/api-key/rotate', { method: 'POST', authorization: apiKey });
}

export function listListings(apiKey: string) {
  return callApi<{ listings: ApiListingView[] }>('/v1/listings', { authorization: apiKey });
}

export function getListing(apiKey: string, id: string) {
  return callApi<ApiListingView>(`/v1/listings/${id}`, { authorization: apiKey });
}

export function createListing(apiKey: string, input: CreateListingRequest) {
  return callApi<ApiListingView>('/v1/listings', { method: 'POST', authorization: apiKey, body: input });
}

export function configureListingPricing(apiKey: string, id: string, input: ConfigurePricingRequest) {
  return callApi<ApiListingView>(`/v1/listings/${id}/pricing`, {
    method: 'PATCH',
    authorization: apiKey,
    body: input,
  });
}

export function configureListingPayment(apiKey: string, id: string, input: ConfigurePaymentRequest) {
  return callApi<ApiListingView>(`/v1/listings/${id}/payment`, {
    method: 'PATCH',
    authorization: apiKey,
    body: input,
  });
}

export function publishListing(apiKey: string, id: string) {
  return callApi<ApiListingView>(`/v1/listings/${id}/publish`, { method: 'POST', authorization: apiKey });
}

export function getProviderRevenue(apiKey: string) {
  return callApi<RevenueSummaryView>('/v1/providers/me/revenue', { authorization: apiKey });
}

export function errorMessage(body: unknown, fallback = 'Something went wrong.'): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as ErrorResponse).error;
    return err?.message ?? fallback;
  }
  return fallback;
}

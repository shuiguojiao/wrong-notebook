import "server-only";

import type { AIService } from "./types";
import { GeminiProvider } from "./gemini-provider";
import { DEFAULT_MINIMAX_CODE_MODEL } from "../minimax-code/constants";
import { OpenAIProvider, DEFAULT_OPENAI_MODEL } from "./openai-provider";
import { AzureOpenAIProvider } from "./azure-provider";
import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic-provider";
import { MiniMaxCodeProvider } from "./minimax-code-provider";
import { isVendorProvider, resolveVendorConfig, VENDOR_PRESETS } from "./vendor-presets";
import { limitModelConcurrency } from "./concurrency";

export * from "./types";

import { getAppConfig, getActiveOpenAIConfig } from "../config";
import { createLogger } from "../logger";

const logger = createLogger('ai');

/** 并发限制的分组键：同一渠道、地址和模型共用一组名额 */
function concurrencyKey(provider: string, baseUrl: string | undefined, model: string | undefined): string {
    return [provider, baseUrl || '', model || ''].join('|');
}

/** 当前配置的 AI 服务，所有调用受同一模型的并发上限约束 */
export function getAIService(): AIService {
    const { service, key } = createAIService();
    return limitModelConcurrency(service, key);
}

/** 核对只覆盖模型，沿用当前渠道、地址和凭据；仍受模型并发限制。 */
export function getIntegrityAIService(): { service: AIService; model: string } {
    const { service, key, model } = createAIService(getAppConfig().integrityCheckModel?.trim() || undefined);
    return { service: limitModelConcurrency(service, key), model };
}

function createAIService(model?: string): { service: AIService; key: string; model: string } {
    // Always get fresh config
    const config = { ...getAppConfig() };
    if (model) {
        config.gemini = { ...config.gemini, model };
        config.anthropic = { ...config.anthropic, model };
        config.minimaxCode = { ...config.minimaxCode, model };
        config.azure = { ...config.azure, deploymentName: model, model };
    }
    const provider = config.aiProvider;

    if (provider === "openai") {
        const activeConfig = { ...getActiveOpenAIConfig() };
        if (model) activeConfig.model = model;
        logger.info({ activeInstance: activeConfig?.name }, 'Using OpenAI Provider');
        return { model: activeConfig?.model || DEFAULT_OPENAI_MODEL, service: new OpenAIProvider(activeConfig), key: concurrencyKey(provider, activeConfig?.baseUrl, activeConfig?.model || DEFAULT_OPENAI_MODEL) };
    } else if (provider === "azure") {
        logger.info({ deployment: config.azure?.deploymentName }, 'Using Azure OpenAI Provider');
        return { model: config.azure?.model || config.azure?.deploymentName || 'default', service: new AzureOpenAIProvider(config.azure), key: concurrencyKey(provider, config.azure?.endpoint, config.azure?.deploymentName) };
    } else if (provider === "anthropic") {
        logger.info({ model: config.anthropic?.model }, 'Using Anthropic Provider');
        return { model: config.anthropic?.model || DEFAULT_ANTHROPIC_MODEL, service: new AnthropicProvider(config.anthropic), key: concurrencyKey(provider, config.anthropic?.baseUrl, config.anthropic?.model || DEFAULT_ANTHROPIC_MODEL) };
    } else if (provider === "minimax-code") {
        logger.info({ model: config.minimaxCode?.model }, 'Using MiniMax Code OAuth Provider');
        return { model: config.minimaxCode?.model || DEFAULT_MINIMAX_CODE_MODEL, service: new MiniMaxCodeProvider(config.minimaxCode), key: concurrencyKey(provider, undefined, config.minimaxCode?.model || DEFAULT_MINIMAX_CODE_MODEL) };
    } else if (provider === "gemini") {
        logger.info('Using Gemini Provider');
        return { model: config.gemini?.model || 'gemini-2.0-flash', service: new GeminiProvider(config.gemini), key: concurrencyKey(provider, config.gemini?.baseUrl, config.gemini?.model || 'gemini-2.0-flash') };
    } else {
        // 国产大模型官方渠道；未知取值回退到默认的 MiniMax
        const vendor = isVendorProvider(provider) ? provider : 'minimax';
        const vendorConfig = resolveVendorConfig(vendor, model ? { ...config[vendor], model } : config[vendor]);
        logger.info({ vendor: VENDOR_PRESETS[vendor].name, model: vendorConfig.model }, 'Using vendor provider (OpenAI compatible)');
        return { model: vendorConfig.model, service: new OpenAIProvider({ ...vendorConfig, providerId: vendor }), key: concurrencyKey(vendor, vendorConfig.baseUrl, vendorConfig.model) };
    }
}

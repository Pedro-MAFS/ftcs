package com.mfs.tokengateway.server.application;

import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.metering.RequestMeterCommand;
import com.mfs.tokengateway.server.metering.RequestMeterService;
import com.mfs.tokengateway.server.metering.SearchBilling;
import com.mfs.tokengateway.server.security.ChatCaller;
import com.mfs.tokengateway.server.upstream.TavilySearchClient;
import com.mfs.tokengateway.server.upstream.UpstreamException;
import com.mfs.tokengateway.server.upstream.UpstreamSearchResponse;
import com.mfs.tokengateway.server.web.RequestIds;

/**
 * Tavily 搜索代理 + 按次计量落库（US-G5-01/03；鉴权/预检在 Controller）。
 */
@Service
public class SearchProxyApplication {

    private static final Logger log = LoggerFactory.getLogger(SearchProxyApplication.class);

    private static final Set<String> ALLOWED_FIELDS =
            Set.of("query", "max_results", "search_depth", "language");
    private static final int QUERY_MAX_LEN = 400;
    private static final int LANGUAGE_MAX_LEN = 16;
    private static final int MAX_RESULTS_DEFAULT = 5;
    private static final int MAX_RESULTS_MIN = 1;
    private static final int MAX_RESULTS_MAX = 10;
    private static final String SEARCH_DEPTH_BASIC = SearchBilling.SEARCH_DEPTH_BASIC;

    private final TavilySearchClient tavilySearchClient;
    private final ObjectMapper objectMapper;
    private final RequestMeterService requestMeterService;

    public SearchProxyApplication(
            TavilySearchClient tavilySearchClient,
            ObjectMapper objectMapper,
            RequestMeterService requestMeterService) {
        this.tavilySearchClient = tavilySearchClient;
        this.objectMapper = objectMapper;
        this.requestMeterService = requestMeterService;
    }

    public ResponseEntity<String> search(JsonNode body) {
        NormalizedSearchRequest req = validateAndNormalize(body);

        ObjectNode outbound = objectMapper.createObjectNode();
        outbound.put("query", req.query());
        outbound.put("search_depth", SEARCH_DEPTH_BASIC);
        outbound.put("max_results", req.maxResults());
        outbound.put("include_answer", false);
        outbound.put("include_raw_content", false);

        ChatCaller caller = currentCaller();
        String requestId = currentRequestId();
        long startedNs = System.nanoTime();

        try {
            UpstreamSearchResponse upstream = tavilySearchClient.search(outbound);
            ObjectNode dto = projectResponse(req, upstream.body());
            int resultCount = dto.path("results").size();
            meterSuccess(requestId, caller, req.searchDepth(), resultCount, startedNs, upstream.statusCode());
            log.info(
                    "search ok maxResults={} resultCount={}",
                    req.maxResults(),
                    resultCount);
            return ResponseEntity.status(upstream.statusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsString(dto));
        } catch (UpstreamException e) {
            // 先落库再包装为 ResponseStatusException；本 catch 抛出的 RSE 不会再进下面的 RSE 分支
            meterError(requestId, caller, req.searchDepth(), e.getCode(), startedNs, statusOrNull(e));
            throw new ResponseStatusException(e.getStatus(), e.getCode(), e);
        } catch (ResponseStatusException e) {
            // try 内若直接抛 RSE（非 UpstreamException 包装），同样按次落库后透传
            meterError(
                    requestId,
                    caller,
                    req.searchDepth(),
                    e.getReason() != null ? e.getReason() : "error",
                    startedNs,
                    e.getStatusCode() != null ? e.getStatusCode().value() : null);
            throw e;
        } catch (Exception e) {
            meterError(
                    requestId,
                    caller,
                    req.searchDepth(),
                    "upstream_invalid_response",
                    startedNs,
                    null);
            log.warn("search map failure: {}", e.toString());
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "upstream_invalid_response", e);
        }
    }

    private void meterSuccess(
            String requestId,
            ChatCaller caller,
            String searchDepth,
            int resultCount,
            long startedNs,
            int upstreamStatus) {
        requestMeterService.record(new RequestMeterCommand(
                requestId,
                caller,
                SearchBilling.MODEL,
                RequestMeterService.STATUS_SUCCESS,
                SearchBilling.perCallUsage(objectMapper),
                latencyMs(startedNs),
                upstreamStatus,
                SearchBilling.successSummary(searchDepth, resultCount)));
    }

    private void meterError(
            String requestId,
            ChatCaller caller,
            String searchDepth,
            String code,
            long startedNs,
            Integer upstreamStatus) {
        requestMeterService.record(new RequestMeterCommand(
                requestId,
                caller,
                SearchBilling.MODEL,
                RequestMeterService.STATUS_ERROR,
                SearchBilling.perCallUsage(objectMapper),
                latencyMs(startedNs),
                upstreamStatus,
                SearchBilling.errorSummary(searchDepth, code)));
    }

    private static Integer statusOrNull(UpstreamException e) {
        return e.getStatus() != null ? e.getStatus().value() : null;
    }

    private static int latencyMs(long startedNs) {
        return (int) Math.min(Integer.MAX_VALUE, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedNs));
    }

    private static ChatCaller currentCaller() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return null;
        }
        Object value = attrs.getAttribute(ChatCaller.REQUEST_ATTR, RequestAttributes.SCOPE_REQUEST);
        return value instanceof ChatCaller caller ? caller : null;
    }

    private static String currentRequestId() {
        String fromMdc = MDC.get(RequestIds.MDC_KEY);
        if (fromMdc != null && !fromMdc.isBlank()) {
            return fromMdc;
        }
        return RequestIds.newId();
    }

    NormalizedSearchRequest validateAndNormalize(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_json");
        }

        Iterator<String> names = body.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!ALLOWED_FIELDS.contains(name)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "field_not_allowed");
            }
        }

        JsonNode queryNode = body.get("query");
        if (queryNode == null || queryNode.isNull() || !queryNode.isTextual()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "query_required");
        }
        String query = queryNode.asText().trim();
        if (query.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "query_required");
        }
        if (query.length() > QUERY_MAX_LEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "query_too_long");
        }

        int maxResults = MAX_RESULTS_DEFAULT;
        if (body.has("max_results") && !body.get("max_results").isNull()) {
            JsonNode mr = body.get("max_results");
            if (!mr.isIntegralNumber() || !mr.canConvertToInt()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "max_results_invalid");
            }
            maxResults = mr.intValue();
            if (maxResults < MAX_RESULTS_MIN || maxResults > MAX_RESULTS_MAX) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "max_results_invalid");
            }
        }

        String searchDepth = SEARCH_DEPTH_BASIC;
        if (body.has("search_depth") && !body.get("search_depth").isNull()) {
            JsonNode depth = body.get("search_depth");
            if (!depth.isTextual()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "search_depth_not_allowed");
            }
            searchDepth = depth.asText();
            if (!SEARCH_DEPTH_BASIC.equals(searchDepth)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "search_depth_not_allowed");
            }
        }

        String language = null;
        if (body.has("language") && !body.get("language").isNull()) {
            JsonNode lang = body.get("language");
            if (!lang.isTextual()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "language_invalid");
            }
            language = lang.asText().trim();
            if (language.isEmpty() || language.length() > LANGUAGE_MAX_LEN) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "language_invalid");
            }
        }

        return new NormalizedSearchRequest(query, maxResults, searchDepth, language);
    }

    private ObjectNode projectResponse(NormalizedSearchRequest req, String upstreamBody)
            throws Exception {
        JsonNode root = objectMapper.readTree(upstreamBody);
        if (root == null || !root.isObject()) {
            throw UpstreamException.invalidResponse();
        }
        JsonNode resultsNode = root.get("results");
        if (resultsNode == null || !resultsNode.isArray()) {
            throw UpstreamException.invalidResponse();
        }

        ObjectNode dto = objectMapper.createObjectNode();
        dto.put("query", req.query());
        if (req.language() != null) {
            dto.put("language", req.language());
        }
        dto.put("search_depth", req.searchDepth());
        dto.put("max_results", req.maxResults());

        ArrayNode outResults = dto.putArray("results");
        for (JsonNode item : resultsNode) {
            if (item == null || !item.isObject()) {
                continue;
            }
            ObjectNode row = outResults.addObject();
            String url = textOrEmpty(item, "url");
            String title = textOrEmpty(item, "title");
            if (title.isEmpty()) {
                title = url;
            }
            row.put("title", title);
            row.put("url", url);
            row.put("content", textOrEmpty(item, "content"));
            JsonNode score = item.get("score");
            if (score != null && score.isNumber()) {
                row.put("score", score.asDouble());
            }
        }
        return dto;
    }

    private static String textOrEmpty(JsonNode obj, String field) {
        JsonNode n = obj.get(field);
        if (n == null || n.isNull() || !n.isTextual()) {
            return "";
        }
        return n.asText();
    }

    record NormalizedSearchRequest(String query, int maxResults, String searchDepth, String language) {
    }
}

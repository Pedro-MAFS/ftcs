package com.mfs.tokengateway.server.upstream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.http.HttpClient;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

class DeepSeekStreamClientPrepareTest {

    @Test
    void forcesStreamAndIncludeUsage() {
        TokenGatewayProperties properties = new TokenGatewayProperties();
        DeepSeekStreamClient client =
                new DeepSeekStreamClient(HttpClient.newHttpClient(), properties, new ObjectMapper());

        ObjectMapper mapper = new ObjectMapper();
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");
        body.put("stream", false);
        body.putObject("stream_options").put("include_usage", false);

        ObjectNode outbound = client.prepareOutbound(body);
        assertTrue(outbound.get("stream").asBoolean());
        assertTrue(outbound.get("stream_options").get("include_usage").asBoolean());
        assertEquals("deepseek-v4-flash", outbound.get("model").asText());
    }
}

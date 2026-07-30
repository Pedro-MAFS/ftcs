package com.mfs.tokengateway.server.upstream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.mfs.tokengateway.server.metering.RequestMeterCommand;
import com.mfs.tokengateway.server.metering.RequestMeterService;

/** 流式结束：结构化日志 + 写 {@code token_request_logs}（US-G0-09；不算价）。 */
@Component
public class LoggingStreamFinishListener implements StreamFinishListener {

    private static final Logger log = LoggerFactory.getLogger(LoggingStreamFinishListener.class);

    private final RequestMeterService requestMeterService;

    public LoggingStreamFinishListener(RequestMeterService requestMeterService) {
        this.requestMeterService = requestMeterService;
    }

    @Override
    public void onFinished(StreamFinishContext context) {
        log.info(
                "chat stream finished requestId={} interrupted={} hasUsage={} model={}",
                context.requestId(),
                context.interrupted(),
                context.hasUsage(),
                context.model());

        String status = context.interrupted()
                ? RequestMeterService.STATUS_INTERRUPTED
                : RequestMeterService.STATUS_SUCCESS;
        requestMeterService.record(new RequestMeterCommand(
                context.requestId(),
                context.caller(),
                context.model(),
                status,
                context.usage(),
                context.latencyMs(),
                context.upstreamStatus(),
                context.errorSummary()));
    }
}

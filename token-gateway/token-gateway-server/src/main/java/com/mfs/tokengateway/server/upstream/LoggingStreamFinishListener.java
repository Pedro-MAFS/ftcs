package com.mfs.tokengateway.server.upstream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** G0-04 默认结束监听：结构化日志，不记 prompt/completion。 */
@Component
public class LoggingStreamFinishListener implements StreamFinishListener {

    private static final Logger log = LoggerFactory.getLogger(LoggingStreamFinishListener.class);

    @Override
    public void onFinished(StreamFinishContext context) {
        log.info(
                "chat stream finished requestId={} interrupted={} hasUsage={}",
                context.requestId(),
                context.interrupted(),
                context.hasUsage());
    }
}

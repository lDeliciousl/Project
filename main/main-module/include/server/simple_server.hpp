#ifndef SIMPLE_SERVER_HPP
#define SIMPLE_SERVER_HPP

#include <crow.h>
#include <string>
#include <memory>

class SimpleServer {
public:
    SimpleServer(int port = 3002);
    
    void run();
    void stop();
    
private:
    void setup_routes();
    
    int port_;
    std::unique_ptr<crow::SimpleApp> app_;
};

#endif // SIMPLE_SERVER_HPP

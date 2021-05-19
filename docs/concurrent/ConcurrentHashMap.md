# ConcurrentHashMap

[文章参考](https://blog.csdn.net/weixin_30342639/article/details/107420546)

Java 7 为实现并行访问，引入了 Segment 这一结构，实现了分段锁，理论上最大并发度与 Segment 个数相等。

Java 8 放弃了一个 HashMap 被一个 Segment 封装加上锁的复杂设计，取而代之的是在 HashMap 的每个 Node 上增加 CAS + Synchronized 来保证并发安全进行实现。

同时为了提高哈希碰撞下的寻址性能，Java 8 在链表长度超过一定阈值（8）时将链表（寻址时间复杂度为 O(N)）转换为 红黑树（寻址时间复杂度为 O(log(N))）

那么我肯定是基于 java8 进行源码学习

```java
    public class ConcurrentHashMap<K,V> extends AbstractMap<K,V>
    implements ConcurrentMap<K,V>, Serializable {
        private static final long serialVersionUID = 7249069246763182397L;

    ...省略
    }
```

## 属性

```java






```

## 方法
